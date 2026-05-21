#!/usr/bin/env python3
"""Emit one-line JSON with host metrics (Linux / macOS)."""
import json
import os
import platform
import re
import subprocess
import sys
import time


def linux_cpu_percent():
    def times():
        with open("/proc/stat", encoding="utf-8") as f:
            parts = f.readline().split()[1:]
            vals = [int(x) for x in parts[:7]]
            idle = vals[3] + (vals[4] if len(vals) > 4 else 0)
            return idle, sum(vals)

    i1, t1 = times()
    time.sleep(1)
    i2, t2 = times()
    dt = t2 - t1
    if dt <= 0:
        return 0.0
    return round(max(0.0, min(100.0, (1 - (i2 - i1) / dt) * 100)), 1)


def linux_memory():
    mem = {}
    with open("/proc/meminfo", encoding="utf-8") as f:
        for line in f:
            key, val = line.split(":")[0], line.split()[1]
            mem[key] = int(val)
    total_kb = mem.get("MemTotal", 0)
    avail_kb = mem.get("MemAvailable", mem.get("MemFree", 0))
    total = total_kb * 1024
    used = max(0, (total_kb - avail_kb) * 1024)
    pct = round(used / total * 100, 1) if total else 0
    return {"total": total, "used": used, "percent": pct}


def linux_disks():
    disks = []
    try:
        out = subprocess.check_output(
            ["df", "-B1", "--output=target,size,used,avail,pcent"],
            text=True,
            timeout=8,
        )
        for line in out.strip().splitlines()[1:]:
            parts = line.split()
            if len(parts) < 5:
                continue
            target, size, used, avail, pcent = parts[0], int(parts[1]), int(parts[2]), int(parts[3]), parts[4]
            if target.startswith("/dev") or target == "/":
                if size < 1024 * 1024:
                    continue
                disks.append(
                    {
                        "mount": target,
                        "total": size,
                        "used": used,
                        "percent": float(pcent.replace("%", "") or 0),
                    }
                )
    except Exception:
        pass
    return disks[:8]


def linux_gpus():
    gpus = []
    try:
        out = subprocess.check_output(
            [
                "nvidia-smi",
                "--query-gpu=name,utilization.gpu,memory.used,memory.total,temperature.gpu",
                "--format=csv,noheader,nounits",
            ],
            text=True,
            timeout=8,
            stderr=subprocess.DEVNULL,
        )
        for line in out.strip().splitlines():
            if not line.strip():
                continue
            parts = [p.strip() for p in line.split(",")]
            if len(parts) < 5:
                continue
            name, util, mu, mt, temp = parts[0], parts[1], parts[2], parts[3], parts[4]
            gpus.append(
                {
                    "name": name,
                    "utilPercent": float(util) if util not in ("", "[N/A]") else 0,
                    "memUsed": int(float(mu) * 1024 * 1024),
                    "memTotal": int(float(mt) * 1024 * 1024),
                    "tempC": float(temp) if temp not in ("", "[N/A]") else None,
                }
            )
    except Exception:
        pass
    return gpus


def linux_metrics():
    load = [0.0, 0.0, 0.0]
    uptime_sec = 0
    try:
        with open("/proc/loadavg", encoding="utf-8") as f:
            load = [float(x) for x in f.read().split()[:3]]
    except Exception:
        pass
    try:
        with open("/proc/uptime", encoding="utf-8") as f:
            uptime_sec = int(float(f.read().split()[0]))
    except Exception:
        pass
    return {
        "cpu": {"percent": linux_cpu_percent()},
        "memory": linux_memory(),
        "disks": linux_disks(),
        "gpus": linux_gpus(),
        "load": load,
        "uptimeSec": uptime_sec,
    }


def darwin_memory():
    total = 0
    try:
        total = int(subprocess.check_output(["sysctl", "-n", "hw.memsize"], text=True).strip())
    except Exception:
        pass
    page_size = 4096
    pages_free = pages_active = pages_wired = pages_compressed = 0
    try:
        out = subprocess.check_output(["vm_stat"], text=True, timeout=5)
        for line in out.splitlines():
            if "page size" in line.lower():
                m = re.search(r"(\d+)", line)
                if m:
                    page_size = int(m.group(1))
            elif "Pages free" in line:
                pages_free = int(re.search(r"(\d+)", line).group(1))
            elif "Pages active" in line:
                pages_active = int(re.search(r"(\d+)", line).group(1))
            elif "Pages wired" in line:
                pages_wired = int(re.search(r"(\d+)", line).group(1))
            elif "Pages occupied by compressor" in line:
                pages_compressed = int(re.search(r"(\d+)", line).group(1))
    except Exception:
        pass
    used = (pages_active + pages_wired + pages_compressed) * page_size
    if not total:
        total = used + pages_free * page_size
    pct = round(used / total * 100, 1) if total else 0
    return {"total": total, "used": used, "percent": pct}


def darwin_cpu_percent():
    try:
        out = subprocess.check_output(["top", "-l", "1", "-n", "0"], text=True, timeout=8)
        for line in out.splitlines():
            if "CPU usage" in line:
                m = re.search(r"(\d+\.?\d*)% user", line)
                u = float(m.group(1)) if m else 0
                m = re.search(r"(\d+\.?\d*)% sys", line)
                s = float(m.group(1)) if m else 0
                return round(min(100.0, u + s), 1)
    except Exception:
        pass
    return 0.0


def darwin_disks():
    disks = []
    try:
        out = subprocess.check_output(["df", "-k"], text=True, timeout=8)
        for line in out.splitlines()[1:]:
            parts = line.split()
            if len(parts) < 6:
                continue
            fs, total_k, used_k, avail_k, pcent, mount = parts[0], parts[1], parts[2], parts[3], parts[4], parts[5]
            if fs.startswith("/dev") or mount == "/":
                total = int(total_k) * 1024
                used = int(used_k) * 1024
                if total < 1024 * 1024:
                    continue
                disks.append(
                    {
                        "mount": mount,
                        "total": total,
                        "used": used,
                        "percent": float(pcent.replace("%", "") or 0),
                    }
                )
    except Exception:
        pass
    return disks[:8]


def darwin_metrics():
    load = [0.0, 0.0, 0.0]
    uptime_sec = 0
    try:
        out = subprocess.check_output(["sysctl", "-n", "vm.loadavg"], text=True).strip()
        nums = re.findall(r"[\d.]+", out)
        load = [float(x) for x in nums[:3]]
    except Exception:
        pass
    try:
        raw = subprocess.check_output(["sysctl", "-n", "kern.boottime"], text=True)
        m = re.search(r"sec\s*=\s*(\d+)", raw)
        if m:
            uptime_sec = max(0, int(time.time()) - int(m.group(1)))
    except Exception:
        pass
    return {
        "cpu": {"percent": darwin_cpu_percent()},
        "memory": darwin_memory(),
        "disks": darwin_disks(),
        "gpus": [],
        "load": load,
        "uptimeSec": uptime_sec,
    }


def main():
    sys_name = platform.system()
    data = {
        "os": sys_name,
        "hostname": platform.node(),
        "timestamp": int(time.time()),
    }
    try:
        if sys_name == "Linux":
            data.update(linux_metrics())
        elif sys_name == "Darwin":
            data.update(darwin_metrics())
        else:
            data["error"] = f"暂不支持远程系统: {sys_name}"
    except Exception as exc:
        data["error"] = str(exc)
    print(json.dumps(data, ensure_ascii=False))


if __name__ == "__main__":
    main()
