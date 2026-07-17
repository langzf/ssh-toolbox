const { RISK } = require('../types');

const askUserTool = {
  name: 'agent.ask_user',
  description: '向用户追问缺失信息（如选择服务器、确认路径等）',
  riskLevel: RISK.READ,
  available: true,
  inputSchema: {
    type: 'object',
    properties: {
      question: { type: 'string', description: '要问用户的问题' },
    },
    required: ['question'],
  },
  async execute(args) {
    return { ok: true, data: { question: String(args.question || '').trim() } };
  },
};

module.exports = [askUserTool];
