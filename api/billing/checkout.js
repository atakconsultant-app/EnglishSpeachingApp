// POST /api/billing/checkout { interval: 'month' | 'year', lang } — Pro の申込画面（Stripe Checkout）の URL を返す。
// 初めての申込なら3日間の無料お試しを付ける（カードの入力は必須。お試し中に解約すれば請求なし）。
const b = require('../../lib/billing');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return b.send(res, 405, { error: 'method_not_allowed' }); }
  if (!b.billingEnabled()) return b.send(res, 503, { error: 'billing_not_configured' });
  const user = await b.getUser(req);
  if (!user) return b.send(res, 401, { error: 'unauthorized' });
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
  body = body || {};
  const price = body.interval === 'year' ? b.env('STRIPE_PRICE_YEARLY') : b.env('STRIPE_PRICE_MONTHLY');
  try {
    const row = await b.getSubscription(user.id);
    if (b.isPro(row)) return b.send(res, 409, { error: 'already_subscribed' });
    let customer = row && row.stripe_customer_id;
    if (!customer) {
      const c = await b.stripe().customers.create({ email: user.email || undefined, metadata: { user_id: user.id } });
      customer = c.id;
      await b.upsertSubscription({ user_id: user.id, stripe_customer_id: customer });
    }
    const trial = !(row && row.has_trialed);
    const origin = b.siteOrigin(req);
    const session = await b.stripe().checkout.sessions.create({
      mode: 'subscription',
      customer,
      client_reference_id: user.id,
      line_items: [{ price, quantity: 1 }],
      payment_method_collection: 'always',
      subscription_data: { metadata: { user_id: user.id }, ...(trial ? { trial_period_days: b.TRIAL_DAYS } : {}) },
      locale: b.STRIPE_LOCALES[body.lang] || 'auto',
      success_url: `${origin}/?billing=success`,
      cancel_url: `${origin}/?billing=cancel`,
    });
    return b.send(res, 200, { url: session.url, trial });
  } catch (e) {
    console.error('checkout failed', e);
    return b.send(res, 502, { error: 'checkout_failed' });
  }
};
