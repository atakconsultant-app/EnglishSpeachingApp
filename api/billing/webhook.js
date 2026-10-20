// POST /api/billing/webhook — Stripe からの知らせ（契約の開始・更新・解約）を受け取り、契約テーブルに反映する。
// 署名（STRIPE_WEBHOOK_SECRET）を確認し、Stripe 以外からのリクエストは受け付けない。
const b = require('../../lib/billing');

const HANDLED = new Set([
  'checkout.session.completed',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'customer.subscription.paused',
  'customer.subscription.resumed',
]);

// 署名の確認には、加工前のリクエスト本文が必要。req.body に触れると Vercel が JSON として読んでしまうため、先に本文をそのまま読む
async function rawBody(req) {
  const chunks = [];
  if (typeof req[Symbol.asyncIterator] === 'function' && !req.readableEnded) {
    for await (const chunk of req) chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  if (chunks.length) return Buffer.concat(chunks);
  if (Buffer.isBuffer(req.rawBody)) return req.rawBody;
  if (Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === 'string') return Buffer.from(req.body);
  return Buffer.alloc(0);
}

async function handler(req, res) {
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return b.send(res, 405, { error: 'method_not_allowed' }); }
  const secret = b.env('STRIPE_WEBHOOK_SECRET');
  if (!b.billingEnabled() || !secret) return b.send(res, 503, { error: 'billing_not_configured' });
  let event;
  try {
    event = b.stripe().webhooks.constructEvent(await rawBody(req), req.headers['stripe-signature'], secret);
  } catch (e) {
    console.warn('Stripe webhook signature check failed', e.message);
    return b.send(res, 400, { error: 'invalid_signature' });
  }
  if (!HANDLED.has(event.type)) return b.send(res, 200, { received: true, ignored: event.type });
  try {
    const obj = event.data.object;
    const subscriptionId = event.type === 'checkout.session.completed' ? obj.subscription : obj.id;
    if (subscriptionId) await b.syncSubscription(typeof subscriptionId === 'string' ? subscriptionId : subscriptionId.id);
    return b.send(res, 200, { received: true });
  } catch (e) {
    // 500 を返すと Stripe が時間をおいて再送してくれる
    console.error('Stripe webhook handling failed', event.type, e);
    return b.send(res, 500, { error: 'webhook_failed' });
  }
}

module.exports = handler;
// Next.js 形式の設定（Vercel が本文を加工しないように）。プレーンな関数では無視されるが害はない
module.exports.config = { api: { bodyParser: false } };
