-- 有料プラン（Stripe）と、ニュースの一時保存のためのテーブルと関数。
-- Supabase ダッシュボード → SQL Editor にこのファイルの内容を貼り付けて「Run」で一度だけ実行する。

-- 利用者ごとの契約の状態（Stripe の Webhook でサーバーが書き込む）
create table if not exists public.subscriptions (
  user_id                uuid primary key references auth.users (id) on delete cascade,
  stripe_customer_id     text unique,
  stripe_subscription_id text,
  status                 text,                  -- trialing / active / past_due / canceled など（Stripe と同じ）
  interval               text,                  -- month / year
  current_period_end     timestamptz,           -- 次回の請求日（お試し中はお試しの終了日）
  trial_end              timestamptz,
  cancel_at_period_end   boolean not null default false,
  has_trialed            boolean not null default false, -- お試しは1人1回まで
  updated_at             timestamptz not null default now()
);
-- ブラウザからは読み書きできず、サーバーの service_role だけが触れる
alter table public.subscriptions enable row level security;

-- 無料プランの1日あたりの利用回数（会話・翻訳を別々に数える）
create table if not exists public.ai_usage_kind (
  user_id uuid not null references auth.users (id) on delete cascade,
  day     date not null,
  kind    text not null,
  count   integer not null default 0,
  primary key (user_id, day, kind)
);
alter table public.ai_usage_kind enable row level security;

-- 今日（日本時間）の kind の回数を1増やし、残り回数を返す。上限に達していれば増やさずに -1 を返す。
create or replace function public.consume_ai_quota_kind(p_user_id uuid, p_kind text, p_limit integer)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  insert into public.ai_usage_kind (user_id, day, kind, count)
  values (p_user_id, (now() at time zone 'Asia/Tokyo')::date, p_kind, 0)
  on conflict (user_id, day, kind) do nothing;

  update public.ai_usage_kind
     set count = count + 1
   where user_id = p_user_id
     and day = (now() at time zone 'Asia/Tokyo')::date
     and kind = p_kind
     and count + 1 <= p_limit
  returning count into v_count;

  if v_count is null then
    return -1;
  end if;
  return p_limit - v_count;
end;
$$;

revoke all on function public.consume_ai_quota_kind(uuid, text, integer) from public, anon, authenticated;
grant execute on function public.consume_ai_quota_kind(uuid, text, integer) to service_role;

-- 取得したニュースを1時間保存する（GNews の呼び出し回数を抑えるため。Azure では CDN の代わりになる）
create table if not exists public.news_cache (
  key        text primary key,
  articles   jsonb not null,
  fetched_at timestamptz not null default now()
);
alter table public.news_cache enable row level security;
