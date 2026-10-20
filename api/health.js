// GET /api/health — 公開先の設定を確かめるためのページ。
// 環境変数が「入っているかどうか」と、外部サービスにつながるかだけを返す（キーの値そのものは返さない）。
function has(...names) { return names.some(n => !!process.env[n]); }
function env(...names) { for (const n of names) if (process.env[n]) return process.env[n]; return ''; }

async function check(fn) {
  try { return await fn(); } catch (e) { return `error: ${String(e.message || e).slice(0, 80)}`; }
}

module.exports = async function handler(req, res) {
  const supabaseUrl = env('NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_URL').replace(/\/$/, '');
  const anon = env('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_ANON_KEY');
  const secret = env('SUPABASE_SECRET_KEY', 'SUPABASE_SERVICE_ROLE_KEY');
  const result = {
    runtime: `node ${process.version}`,
    region: process.env.REGION_NAME || process.env.VERCEL_REGION || null,
    env: {
      ANTHROPIC_API_KEY: has('ANTHROPIC_API_KEY'),
      GNEWS_API_KEY: has('GNEWS_API_KEY'),
      AZURE_SPEECH_KEY: has('AZURE_SPEECH_KEY'),
      AZURE_SPEECH_REGION: env('AZURE_SPEECH_REGION') || false,
      SUPABASE_URL: !!supabaseUrl,
      SUPABASE_ANON_KEY: !!anon,
      SUPABASE_SECRET_KEY: !!secret,
      STRIPE: has('STRIPE_SECRET_KEY') && has('STRIPE_PRICE_MONTHLY') && has('STRIPE_PRICE_YEARLY'),
      APP_URL: env('APP_URL') || false,
    },
    checks: {},
  };
  // Supabase：公開キーで設定を読めるか
  result.checks.supabase_public = !supabaseUrl || !anon ? 'skipped' : await check(async () => {
    const r = await fetch(`${supabaseUrl}/auth/v1/settings`, { headers: { apikey: anon } });
    return r.status;
  });
  // Supabase：サーバー用キーで回数の表（ai_usage）を読めるか
  result.checks.supabase_secret = !supabaseUrl || !secret ? 'skipped' : await check(async () => {
    const r = await fetch(`${supabaseUrl}/rest/v1/ai_usage?select=day&limit=1`, {
      headers: { apikey: secret, ...(secret.startsWith('eyJ') ? { Authorization: `Bearer ${secret}` } : {}) },
    });
    return r.status;
  });
  // Claude API：キーが有効か（モデル一覧を取るだけ。料金はかからない）
  result.checks.anthropic = !has('ANTHROPIC_API_KEY') ? 'skipped' : await check(async () => {
    const r = await fetch('https://api.anthropic.com/v1/models?limit=1', {
      headers: { 'x-api-key': env('ANTHROPIC_API_KEY'), 'anthropic-version': '2023-06-01' },
    });
    if (r.ok) return r.status;
    const body = await r.text().catch(() => '');
    return `${r.status} ${body.slice(0, 200)}`;
  });
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json(result);
};
