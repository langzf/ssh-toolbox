function normalizeBaseUrl(url) {
  let u = String(url || '').trim().replace(/\/+$/, '');
  if (u.endsWith('/v1')) u = u.slice(0, -3);
  return u;
}

function buildChatUrl(baseUrl) {
  return `${normalizeBaseUrl(baseUrl)}/v1/chat/completions`;
}

function assertChatConfig({ baseUrl, apiKey }) {
  if (!apiKey) throw new Error('请先在设置中配置 Agent API Key');
  if (!normalizeBaseUrl(baseUrl)) throw new Error('请配置 Agent Base URL');
}

async function chatCompletion({ baseUrl, apiKey, model, messages, tools, timeoutMs }) {
  assertChatConfig({ baseUrl, apiKey });
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
  } catch (err) {
    if (err?.name === 'AbortError') throw new Error('LLM 请求超时');
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * OpenAI-compatible SSE stream. Calls onDelta({ type:'content', text }) for text chunks.
 * Returns the same shape as chatCompletion: { choices: [{ message }] }.
 */
async function chatCompletionStream({
  baseUrl,
  apiKey,
  model,
  messages,
  tools,
  timeoutMs,
  onDelta,
}) {
  assertChatConfig({ baseUrl, apiKey });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs || 60000);

  try {
    const body = { model, messages, stream: true };
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

    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      const msg = json.error?.message || json.message || `LLM 请求失败 (${res.status})`;
      throw new Error(msg);
    }

    if (!res.body || typeof res.body.getReader !== 'function') {
      // Fallback: some environments lack streaming body
      const json = await res.json().catch(() => ({}));
      const message = json.choices?.[0]?.message;
      if (message?.content && onDelta) onDelta({ type: 'content', text: message.content });
      return json;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    let content = '';
    const toolCallsByIndex = new Map();

    const mergeToolDelta = (tc) => {
      const idx = tc.index ?? 0;
      let acc = toolCallsByIndex.get(idx);
      if (!acc) {
        acc = {
          id: '',
          type: 'function',
          function: { name: '', arguments: '' },
        };
        toolCallsByIndex.set(idx, acc);
      }
      if (tc.id) acc.id = tc.id;
      if (tc.type) acc.type = tc.type;
      if (tc.function?.name) acc.function.name += tc.function.name;
      if (tc.function?.arguments) acc.function.arguments += tc.function.arguments;
    };

    const handleSseData = (dataStr) => {
      const trimmed = dataStr.trim();
      if (!trimmed || trimmed === '[DONE]') return;
      let json;
      try {
        json = JSON.parse(trimmed);
      } catch (_) {
        return;
      }
      const delta = json.choices?.[0]?.delta;
      if (!delta) return;
      if (delta.content) {
        content += delta.content;
        onDelta?.({ type: 'content', text: delta.content });
      }
      if (Array.isArray(delta.tool_calls)) {
        for (const tc of delta.tool_calls) mergeToolDelta(tc);
      }
    };

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split('\n');
      buffer = parts.pop() || '';
      for (const line of parts) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith(':')) continue;
        if (trimmed.startsWith('data:')) {
          handleSseData(trimmed.slice(5).trimStart());
        }
      }
    }

    if (buffer.trim().startsWith('data:')) {
      handleSseData(buffer.trim().slice(5).trimStart());
    }

    const message = { role: 'assistant', content: content || null };
    const toolCalls = [...toolCallsByIndex.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([, tc]) => tc)
      .filter((tc) => tc.function?.name);
    if (toolCalls.length) message.tool_calls = toolCalls;

    return { choices: [{ message }] };
  } catch (err) {
    if (err?.name === 'AbortError') throw new Error('LLM 请求超时');
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

module.exports = {
  normalizeBaseUrl,
  buildChatUrl,
  chatCompletion,
  chatCompletionStream,
};
