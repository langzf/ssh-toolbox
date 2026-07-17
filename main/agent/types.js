const RISK = { READ: 'read', WRITE: 'write', DANGER: 'danger' };
const POLICY = { STRICT: 'strict', STANDARD: 'standard', RELAXED: 'relaxed' };
const DEFAULT_AGENT_SETTINGS = {
  baseUrl: 'https://api.openai.com',
  model: 'gpt-4o-mini',
  policyMode: POLICY.STANDARD,
  maxSteps: 12,
  timeoutMs: 60000,
};
module.exports = { RISK, POLICY, DEFAULT_AGENT_SETTINGS };
