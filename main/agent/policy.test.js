const { test } = require('node:test');
const assert = require('node:assert/strict');
const { classifyCommand, decide } = require('./policy');
const { RISK, POLICY } = require('./types');

test('classifyCommand: df -h is read', () => {
  assert.equal(classifyCommand('df -h'), RISK.READ);
});

test('classifyCommand: systemctl restart nginx is write', () => {
  assert.equal(classifyCommand('systemctl restart nginx'), RISK.WRITE);
});

test('classifyCommand: rm -rf / is danger', () => {
  assert.equal(classifyCommand('rm -rf /'), RISK.DANGER);
});

test('classifyCommand: ls and free are read', () => {
  assert.equal(classifyCommand('ls -la /var/log'), RISK.READ);
  assert.equal(classifyCommand('free -m'), RISK.READ);
});

test('classifyCommand: echo redirect is write', () => {
  assert.equal(classifyCommand('echo foo > /etc/nginx/nginx.conf'), RISK.WRITE);
});

test('decide: standard read → auto', () => {
  assert.equal(decide(RISK.READ, POLICY.STANDARD, new Set()), 'auto');
});

test('decide: standard write → confirm', () => {
  assert.equal(decide(RISK.WRITE, POLICY.STANDARD, new Set()), 'confirm');
});

test('decide: strict danger → deny', () => {
  assert.equal(decide(RISK.DANGER, POLICY.STRICT, new Set()), 'deny');
});

test('decide: relaxed write → auto', () => {
  assert.equal(decide(RISK.WRITE, POLICY.RELAXED, new Set()), 'auto');
});

test('decide: relaxed danger → confirm', () => {
  assert.equal(decide(RISK.DANGER, POLICY.RELAXED, new Set()), 'confirm');
});

test('decide: session allow set bypasses confirm', () => {
  const allowed = new Set([RISK.WRITE]);
  assert.equal(decide(RISK.WRITE, POLICY.STANDARD, allowed), 'auto');
});
