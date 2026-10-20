// GET /api/billing/status — ログイン中の利用者のプランと契約の状態、Pro の料金を返す。
const b = require('../../lib/billing');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return b.send(res, 405, { error: 'method_not_allowed' }); }
  if (!b.billingEnabled()) return b.send(res, 200, { enabled: false, plan: 'pro' });
  const user = await b.getUser(req);
  if (!user) return b.send(res, 401, { error: 'unauthorized' });
  try {
    const [row, prices] = await Promise.all([b.getSubscription(user.id), b.getPrices()]);
    return b.send(res, 200, {
      enabled: true,
      plan: b.isPro(row) ? 'pro' : 'free',
      status: row ? row.status : null,
      interval: row ? row.interval : null,
      currentPeriodEnd: row ? row.current_period_end : null,
      trialEnd: row ? row.trial_end : null,
      cancelAtPeriodEnd: row ? !!row.cancel_at_period_end : false,
      trialAvailable: !(row && row.has_trialed),
      trialDays: b.TRIAL_DAYS,
      hasCustomer: !!(row && row.stripe_customer_id),
      prices,
      freeLimits: b.FREE_LIMITS,
    });
  } catch (e) {
    console.error('billing status failed', e);
    return b.send(res, 503, { error: 'billing_unavailable' });
  }
};
