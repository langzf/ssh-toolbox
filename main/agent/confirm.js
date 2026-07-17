const crypto = require('node:crypto');

const CONFIRM_TIMEOUT_MS = 120_000;

function createConfirmManager(getWebContents) {
  /** @type {Map<string, { resolve: (d: string) => void, timer: NodeJS.Timeout }>} */
  const pending = new Map();

  function createRequestConfirm(agentSessionId) {
    return async (req) => {
      const confirmId = `confirm-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
      const payload = {
        confirmId,
        agentSessionId,
        toolName: req.toolName,
        riskLevel: req.riskLevel,
        args: req.args,
        reason: req.reason,
      };

      return new Promise((resolve) => {
        const timer = setTimeout(() => {
          pending.delete(confirmId);
          resolve('deny');
        }, CONFIRM_TIMEOUT_MS);

        pending.set(confirmId, { resolve, timer });
        const wc = getWebContents?.();
        if (wc && !wc.isDestroyed()) {
          wc.send('agent-confirm-request', payload);
        } else {
          clearTimeout(timer);
          pending.delete(confirmId);
          resolve('deny');
        }
      });
    };
  }

  function handleResponse({ confirmId, decision }) {
    const entry = pending.get(confirmId);
    if (!entry) return false;
    clearTimeout(entry.timer);
    pending.delete(confirmId);
    const allowed = decision === 'allow-once' || decision === 'allow-session';
    entry.resolve(allowed ? decision : 'deny');
    return true;
  }

  return { createRequestConfirm, handleResponse, CONFIRM_TIMEOUT_MS };
}

module.exports = { createConfirmManager, CONFIRM_TIMEOUT_MS };
