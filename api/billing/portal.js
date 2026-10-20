// POST /api/billing/portal { lang } — お支払い方法の変更・領収書・解約ができる Stripe の管理画面の URL を返す。
const b = require('../../lib/billing');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return b.send(res, 405, { error: 'method_not_allowed' }); }
  if (!b.billingEnabled()) return b.send(res, 503, { error: 'billing_not_configured' });
  const user = await b.getUser(req);
  if (!user) return b.send(res, 401, { error: 'unauthorized' });
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
  body = body || {};
  try {
    const row = await b.getSubscription(user.id);
    if (!row || !row.stripe_customer_id) return b.send(res, 404, { error: 'no_customer' });
    const session = await b.stripe().billingPortal.sessions.create({
      customer: row.stripe_customer_id,
      return_url: `${b.siteOrigin(req)}/?billing=portal`,
      locale: b.STRIPE_LOCALES[body.lang] || 'auto',
    });
    return b.send(res, 200, { url: session.url });
  } catch (e) {
    console.error('portal failed', e);
    return b.send(res, 502, { error: 'portal_failed' });
  }
};
