// POST /api/account/delete — 退会（アカウントの削除）。
// 1. Pro の契約があれば Stripe で即時に解約する（返金はしない）
// 2. 学習データ（learning_data）を削除する
// 3. Supabase のアカウントを削除する（契約・利用回数などの表は、アカウントの削除に合わせて自動で消える）
const b = require('../../lib/billing');

function adminHeaders(key) {
  return { apikey: key, ...(key.startsWith('eyJ') ? { Authorization: `Bearer ${key}` } : {}), 'Content-Type': 'application/json' };
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return b.send(res, 405, { error: 'method_not_allowed' }); }
  const user = await b.getUser(req);
  if (!user) return b.send(res, 401, { error: 'unauthorized' });
  const key = b.serviceKey();
  if (!key) return b.send(res, 503, { error: 'not_configured' });

  try {
    // 1. Stripe の契約の解約（課金がオフでも、テストの契約が残っていれば解約する）
    if (b.env('STRIPE_SECRET_KEY')) {
      const row = await b.getSubscription(user.id).catch(() => null);
      if (row && row.stripe_subscription_id && b.PRO_STATUSES.has(row.status)) {
        await b.stripe().subscriptions.cancel(row.stripe_subscription_id).catch(e => {
          if (e && e.code !== 'resource_missing') throw e;
        });
      }
    }
    // 2. 学習データ
    const r1 = await b.db(`learning_data?user_id=eq.${encodeURIComponent(user.id)}`, { method: 'DELETE' });
    if (!r1.ok && r1.status !== 404) throw new Error(`learning_data delete ${r1.status}`);
    // 3. アカウント
    const r2 = await fetch(`${b.supabaseUrl()}/auth/v1/admin/users/${encodeURIComponent(user.id)}`, {
      method: 'DELETE', headers: adminHeaders(key),
    });
    if (!r2.ok) throw new Error(`auth admin delete ${r2.status} ${(await r2.text()).slice(0, 200)}`);
    b.forgetPlan(user.id);
    return b.send(res, 200, { deleted: true });
  } catch (e) {
    console.error('account delete failed', e);
    return b.send(res, 502, { error: 'delete_failed' });
  }
};
