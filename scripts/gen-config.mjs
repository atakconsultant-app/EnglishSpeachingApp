import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
const key =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  '';
const redirect = process.env.NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL || '';

if (!url || !key) {
  console.warn('[gen-config] Supabase URL or public key is missing; auth will be unavailable.');
}

// Only public (browser-safe) values are written here. Never add service-role or secret keys.
const config = { url, key, redirect };
const out = fileURLToPath(new URL('../supabase-config.js', import.meta.url));
writeFileSync(out, `window.SUPABASE_CONFIG = ${JSON.stringify(config)};\n`);
console.log('[gen-config] wrote supabase-config.js');
