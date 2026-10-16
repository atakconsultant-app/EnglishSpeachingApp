-- AIの1人1日あたり利用回数を数えるためのテーブルと関数。
-- Supabase ダッシュボード → SQL Editor にこのファイルの内容を貼り付けて「Run」で一度だけ実行する。

create table if not exists public.ai_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  day     date not null,
  count   integer not null default 0,
  primary key (user_id, day)
);

-- 行レベルセキュリティを有効化し、ポリシーは作らない。
-- → ブラウザ（anon / ログインユーザー）からは読み書きできず、サーバーの service_role だけが触れる。
alter table public.ai_usage enable row level security;

-- 今日（日本時間）の回数を1増やし、残り回数を返す。上限を超えていれば -1 を返す。
create or replace function public.consume_ai_quota(p_user_id uuid, p_limit integer)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  insert into public.ai_usage (user_id, day, count)
  values (p_user_id, (now() at time zone 'Asia/Tokyo')::date, 1)
  on conflict (user_id, day) do update set count = public.ai_usage.count + 1
  returning count into v_count;

  if v_count > p_limit then
    return -1;
  end if;
  return p_limit - v_count;
end;
$$;

revoke all on function public.consume_ai_quota(uuid, integer) from public, anon, authenticated;
grant execute on function public.consume_ai_quota(uuid, integer) to service_role;
