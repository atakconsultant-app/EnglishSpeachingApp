// Azure Static Web Apps の API（/api/...）の入口。各 URL を ../api の関数に割り当てる。
const { app } = require('@azure/functions');
const { wrap } = require('./adapter');

const routes = [
  ['news', 'news', ['GET']],
  ['chat', 'chat', ['POST']],
  ['tts', 'tts', ['POST']],
  ['billing-status', 'billing/status', ['GET']],
  ['billing-checkout', 'billing/checkout', ['POST']],
  ['billing-portal', 'billing/portal', ['POST']],
  ['billing-webhook', 'billing/webhook', ['POST']],
];

for (const [name, route, methods] of routes) {
  const handler = require(`./handlers/api/${route}.js`);
  app.http(name, { route, methods, authLevel: 'anonymous', handler: wrap(handler) });
}
