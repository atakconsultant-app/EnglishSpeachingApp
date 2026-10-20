// 課金（Stripe）とプラン判定の共通処理。api/ 以下の関数から require して使う。
//
// プラン
// - 無料: 1日1往復の会話（AIの最初の質問＋返答 = 会話2回）と、その翻訳（2回）。採点と Azure の読み上げは使えない。
// - Pro : Stripe の契約が trialing（お試し中）/ active / past_due（支払いの再試行中）のあいだ。
// Stripe の設定（STRIPE_SECRET_KEY と2つの料金ID）が済むまでは、全員を Pro と同じ扱いにする（公開前の状態を壊さないため）。

const PRO_STATUSES = new Set(['trialing', 'active', 'past_due']);
const FREE_LIMITS = { chat: 2, translate: 2, score: 0 };
const TRIAL_DAYS = 7;

function env(...names) {
  for (const n of names) if (process.env[n]) return process.env[n];
  return '';
}
const supabaseUrl = () => env('NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_URL').replace(/\/$/, '');
const supabaseAnonKey = () => env('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_ANON_KEY');
const serviceKey = () => env('SUPABASE_SECRET_KEY', 'SUPABASE_SERVICE_ROLE_KEY');

function billingEnabled() {
  return !!(env('STRIPE_SECRET_KEY') && env('STRIPE_PRICE_MONTHLY') && env('STRIPE_PRICE_YEARLY'));
}

let stripeClient = null;
function stripe() {
  if (!stripeClient) stripeClient = require('stripe')(env('STRIPE_SECRET_KEY'));
  return stripeClient;
}

function send(res, status, body) {
  res.setHeader('Cache-Control', 'no-store');
  return res.status(status).json(body);
}

// ログイン中の利用者（Supabase に問い合わせて確認）。{ id, email } か null
async function getUser(req) {
  // Azure Static Web Apps は Authorization ヘッダーを書き換えるため、画面から送る X-NS-Auth を優先する
  const auth = req.headers['x-ns-auth'] || req.headers.authorization || req.headers.Authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!token || !supabaseUrl()) return null;
  try {
    const r = await fetch(`${supabaseUrl()}/auth/v1/user`, { headers: { Authorization: `Bearer ${token}`, apikey: supabaseAnonKey() } });
    if (!r.ok) return null;
    const u = await r.json();
    return u && u.id ? { id: u.id, email: u.email || '' } : null;
  } catch (e) {
    return null;
  }
}

// サーバー専用キーで Supabase の REST API を呼ぶ
async function db(path, init = {}) {
  const key = serviceKey();
  if (!key) throw new Error('SUPABASE_SECRET_KEY is not set');
  return fetch(`${supabaseUrl()}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: key,
      ...(key.startsWith('eyJ') ? { Authorization: `Bearer ${key}` } : {}),
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });
}

async function getSubscription(userId) {
  const r = await db(`subscriptions?user_id=eq.${encodeURIComponent(userId)}&select=*`);
  if (!r.ok) throw new Error(`subscriptions read ${r.status}`);
  const rows = await r.json();
  return rows[0] || null;
}

async function findUserIdByCustomer(customerId) {
  const r = await db(`subscriptions?stripe_customer_id=eq.${encodeURIComponent(customerId)}&select=user_id`);
  if (!r.ok) throw new Error(`subscriptions lookup ${r.status}`);
  const rows = await r.json();
  return rows[0] ? rows[0].user_id : null;
}

async function upsertSubscription(row) {
  const r = await db('subscriptions?on_conflict=user_id', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ ...row, updated_at: new Date().toISOString() }),
  });
  if (!r.ok) throw new Error(`subscriptions upsert ${r.status} ${(await r.text()).slice(0, 200)}`);
}

function isPro(row) {
  return !!row && PRO_STATUSES.has(row.status);
}

// 'pro' か 'free'。課金の設定前は全員 'pro'
async function getPlan(userId) {
  if (!billingEnabled()) return 'pro';
  return isPro(await getSubscription(userId)) ? 'pro' : 'free';
}

// 無料プランの今日の残り回数を1つ使う。残り回数を返す（使い切っていれば -1）
async function consumeFreeQuota(userId, kind) {
  const limit = FREE_LIMITS[kind] || 0;
  if (limit <= 0) return -1;
  const r = await db('rpc/consume_ai_quota_kind', {
    method: 'POST',
    body: JSON.stringify({ p_user_id: userId, p_kind: kind, p_limit: limit }),
  });
  if (!r.ok) throw new Error(`consume_ai_quota_kind ${r.status}`);
  return Number(await r.json());
}

// Stripe の契約（subscription）の最新の状態を、契約テーブルに書き写す
async function syncSubscription(subscriptionId) {
  const sub = await stripe().subscriptions.retrieve(subscriptionId);
  const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id;
  const userId = (sub.metadata && sub.metadata.user_id) || await findUserIdByCustomer(customerId);
  if (!userId) {
    console.warn('No user for Stripe customer', customerId);
    return null;
  }
  const current = await getSubscription(userId);
  // 解約済みの古い契約の知らせが、新しい有効な契約を上書きしないようにする
  if (current && current.stripe_subscription_id && current.stripe_subscription_id !== sub.id && isPro(current) && !PRO_STATUSES.has(sub.status)) {
    return current;
  }
  const item = sub.items && sub.items.data && sub.items.data[0];
  const periodEnd = (item && item.current_period_end) || sub.current_period_end || null;
  const row = {
    user_id: userId,
    stripe_customer_id: customerId,
    stripe_subscription_id: sub.id,
    status: sub.status,
    interval: item && item.price && item.price.recurring ? item.price.recurring.interval : null,
    current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
    trial_end: sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : null,
    cancel_at_period_end: !!sub.cancel_at_period_end,
  };
  if (sub.trial_start || sub.trial_end) row.has_trialed = true; // お試しは1人1回まで
  await upsertSubscription(row);
  return row;
}

// 料金の金額（画面に出す用）。Stripe の料金IDから取得し、数時間キャッシュする
let priceCache = { at: 0, value: null };
async function getPrices() {
  if (priceCache.value && Date.now() - priceCache.at < 3 * 60 * 60 * 1000) return priceCache.value;
  const [m, y] = await Promise.all([
    stripe().prices.retrieve(env('STRIPE_PRICE_MONTHLY')),
    stripe().prices.retrieve(env('STRIPE_PRICE_YEARLY')),
  ]);
  const value = {
    currency: m.currency,
    month: m.unit_amount,
    year: y.unit_amount,
  };
  priceCache = { at: Date.now(), value };
  return value;
}

function siteOrigin(req) {
  if (env('APP_URL')) return env('APP_URL').replace(/\/$/, '');
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const proto = req.headers['x-forwarded-proto'] || 'https';
  return `${proto}://${host}`;
}

// Stripe の画面（決済・契約管理）の言語
const STRIPE_LOCALES = { ja: 'ja', ko: 'ko', 'zh-TW': 'zh-TW', fr: 'fr', es: 'es' };

module.exports = {
  env, send, getUser, db, stripe, billingEnabled, getPlan, getSubscription, isPro, upsertSubscription,
  findUserIdByCustomer, consumeFreeQuota, syncSubscription, getPrices, siteOrigin,
  FREE_LIMITS, TRIAL_DAYS, PRO_STATUSES, STRIPE_LOCALES,
};
