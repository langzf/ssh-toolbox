/**
 * @typedef {object} ChannelAdapter
 * @property {(user, text) => Promise<void>} onMessage
 * @property {(req) => Promise<'allow-once'|'allow-session'|'deny'>} requestConfirm
 * @property {(user, payload) => Promise<void>} reply
 */

function createNoopChannelAdapter() {
  return {
    async onMessage() {
      throw new Error('远程通道未启用（二期）');
    },
    async requestConfirm() {
      return 'deny';
    },
    async reply() {},
  };
}

module.exports = { createNoopChannelAdapter };
