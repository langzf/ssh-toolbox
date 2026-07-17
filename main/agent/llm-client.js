function normalizeBaseUrl(url) {
  let u = String(url || '').trim().replace(/\/+$/, '');
  if (u.endsWith('/v1')) u = u.slice(0, -3);
  return u;
}
function buildChatUrl(baseUrl) {
  return `${normalizeBaseUrl(baseUrl)}/v1/chat/completions`;
}
async function chatCompletion({ baseUrl, apiKey, model, messages, tools, timeoutMs }) {
  if (!apiKey) throw new Error('请先在设置中配置 Agent API Key');
  if (!normalizeBaseUrl(baseUrl)) throw new Error('请配置 Agent Base URL');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs || 60000);
  try {
    const body = { model, messages };
    if (tools?.length) body.tools = tools;
    const res = await fetch(buildChatUrl(baseUrl), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = json.error?.message || json.message || `LLM 请求失败 (${res.status})`;
      throw new Error(msg);
    }
    return json;
  } finally {
    clearTimeout(timer);
  }
}
module.exports = { normalizeBaseUrl, buildChatUrl, chatCompletion };
