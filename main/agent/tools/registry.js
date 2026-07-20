/** OpenAI-compatible APIs require tool names matching ^[a-zA-Z0-9_-]+$ (no dots). */
function toApiToolName(name) {
  return String(name || '').replace(/\./g, '_');
}

function createToolRegistry(toolModules = []) {
  const tools = new Map();

  for (const mod of toolModules) {
    for (const tool of mod) {
      tools.set(tool.name, tool);
      const apiName = toApiToolName(tool.name);
      if (apiName !== tool.name) {
        tools.set(apiName, tool);
      }
    }
  }

  function get(name) {
    if (!name) return null;
    return tools.get(name) || tools.get(toApiToolName(name)) || null;
  }

  function listAll() {
    const seen = new Set();
    const result = [];
    for (const tool of tools.values()) {
      if (seen.has(tool.name)) continue;
      seen.add(tool.name);
      result.push(tool);
    }
    return result;
  }

  function listAvailable() {
    return listAll().filter((t) => t.available !== false);
  }

  function toOpenAiTools() {
    return listAvailable().map((t) => ({
      type: 'function',
      function: {
        name: toApiToolName(t.name),
        description: t.description,
        parameters: t.inputSchema,
      },
    }));
  }

  return { get, listAll, listAvailable, toOpenAiTools, toApiToolName };
}

module.exports = { createToolRegistry, toApiToolName };
