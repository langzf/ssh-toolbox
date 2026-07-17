const { RISK, POLICY } = require('./types');

const DANGER_PATTERNS = [
  /\brm\s+(-[^\s]*\s+)*-?r[^\s]*/i,
  /\brm\s+-rf\b/i,
  /\bdd\s+if=/i,
  /\bmkfs\./i,
  /\b>?\s*\/dev\/sd[a-z]/i,
  /\bchmod\s+-?R\s+777\s+\//i,
  /\bkill\s+-9\s+-?\d/i,
  /\bformat\s+/i,
];

const WRITE_PATTERNS = [
  /\bsystemctl\s+(restart|start|stop|enable|disable|reload|mask|unmask)/i,
  /\bservice\s+\S+\s+(restart|start|stop)/i,
  /\b(apt-get|apt|yum|dnf|apk|brew)\s+(install|remove|purge|upgrade|uninstall)/i,
  /\bnpm\s+(install|uninstall|update|ci)/i,
  /\bpip3?\s+install/i,
  /\becho\s+.+\s*>\s*/i,
  /\btee\s+/i,
  /\bsed\s+-i/i,
  /\bmv\s+/i,
  /\bcp\s+/i,
  /\bmkdir\s+/i,
  /\btouch\s+/i,
  /\bchmod\s+/i,
  /\bchown\s+/i,
  /\bwget\s+.+\s+-O/i,
  /\bcurl\s+.+\s+-o/i,
  /\|\s*tee\b/i,
  /\b>\s*\S/,
  /\buseradd\b/i,
  /\busermod\b/i,
  /\buserdel\b/i,
];

function classifyCommand(cmd) {
  const s = String(cmd || '').trim();
  if (!s) return RISK.READ;

  for (const re of DANGER_PATTERNS) {
    if (re.test(s)) return RISK.DANGER;
  }
  for (const re of WRITE_PATTERNS) {
    if (re.test(s)) return RISK.WRITE;
  }
  return RISK.READ;
}

function normalizeDeletePath(remotePath) {
  const raw = String(remotePath || '').trim();
  if (!raw) return '';
  if (raw === '/') return '/';
  return raw.replace(/\/+$/, '');
}

/** Classify sftp.delete risk: broad root/home deletes → danger, else write. */
function classifySftpDelete(remotePath) {
  const p = normalizeDeletePath(remotePath);
  if (!p || p === '/') return RISK.DANGER;
  if (p === '~' || p === '$HOME' || p === '${HOME}') return RISK.DANGER;
  if (/^\/home\/?$/i.test(p) || /^\/root\/?$/i.test(p)) return RISK.DANGER;
  return RISK.WRITE;
}

/** @returns {'auto'|'confirm'|'deny'} */
function decide(risk, policyMode, sessionAllowSet) {
  if (sessionAllowSet?.has(risk)) return 'auto';

  const mode = policyMode || POLICY.STANDARD;

  if (mode === POLICY.STRICT) {
    if (risk === RISK.DANGER) return 'deny';
    if (risk === RISK.READ) return 'auto';
    return 'confirm';
  }

  if (mode === POLICY.RELAXED) {
    if (risk === RISK.READ || risk === RISK.WRITE) return 'auto';
    return 'confirm';
  }

  if (risk === RISK.READ) return 'auto';
  return 'confirm';
}

module.exports = { classifyCommand, classifySftpDelete, decide };
