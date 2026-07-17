const { test } = require('node:test');
const assert = require('node:assert/strict');
const { classifyCommand } = require('./policy');
const { RISK } = require('./types');

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
