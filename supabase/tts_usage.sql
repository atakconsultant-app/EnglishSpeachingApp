-- Azure 読み上げの1人1日あたりの文字数を数えるためのテーブルと関数。
-- Supabase ダッシュボード → SQL Editor にこのファイルの内容を貼り付けて「Run」で一度だけ実行する。
-- （未実行でも読み上げは動くが、文字数の上限はかからない）

create table if not exists public.tts_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  day     date not null,
  chars   integer not null default 0,
  primary key (user_id, day)
);

-- ブラウザからは読み書きできず、サーバーの service_role だけが触れる
alter table public.tts_usage enable row level security;

-- 今日（日本時間）の文字数に p_chars を加え、残り文字数を返す。上限を超える場合は加算せずに -1 を返す。
create or replace function public.consume_tts_quota(p_user_id uuid, p_chars integer, p_limit integer)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_chars integer;
begin
  insert into public.tts_usage (user_id, day, chars)
  values (p_user_id, (now() at time zone 'Asia/Tokyo')::date, 0)
  on conflict (user_id, day) do nothing;

  update public.tts_usage
     set chars = chars + p_chars
   where user_id = p_user_id
     and day = (now() at time zone 'Asia/Tokyo')::date
     and chars + p_chars <= p_limit
  returning chars into v_chars;

  if v_chars is null then
    return -1;
  end if;
  return p_limit - v_chars;
end;
$$;

revoke all on function public.consume_tts_quota(uuid, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_tts_quota(uuid, integer, integer) to service_role;
