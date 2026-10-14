(function () {
  const cfg = window.SUPABASE_CONFIG || {};
  if (!window.supabase || !cfg.url || !cfg.key) {
    window.nsSupabase = null;
    return;
  }
  window.nsSupabase = window.supabase.createClient(cfg.url, cfg.key, {
    auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  });
  window.nsAuthRedirectUrl = cfg.redirect || location.origin + '/auth/callback';
})();
