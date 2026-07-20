function toApiToolName(name) {
  return String(name).replace(/\./g, '_');
}

function createToolRegistry(toolModules = []) {
  const tools = new Map();

  for (const mod of toolModules) {
    for (const tool of mod) {
      tools.set(tool.name, tool);
    }
  }

  function get(name) {
    return tools.get(name) || null;
  }

  function listAll() {
    return [...tools.values()];
  }

  function listAvailable() {
    return listAll().filter((t) => t.available !== false);
  }

  function toOpenAiTools() {
    return listAvailable().map((t) => ({
      type: 'function',
      function: {
        name: t.name,
        description: t.description,
        parameters: t.inputSchema,
      },
    }));
  }

  return { get, listAll, listAvailable, toOpenAiTools };
}

module.exports = { createToolRegistry, toApiToolName };
