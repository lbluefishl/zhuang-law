-- Self-signup gated by an invite code, enforced server-side via a Supabase Auth
-- Hook (not just client-side JS, which would be trivially bypassable since the
-- anon key is public — see build_status memory / family-site-spec.md §4).
-- Run this whole file in the SQL Editor, then complete the two dashboard steps
-- described alongside it before signup.html will actually work.

-- 1. Where the current invite code(s) live. RLS enabled with NO policies at
-- all — nobody can read this through the public API, only the SECURITY
-- DEFINER hook function below (which runs with elevated rights, bypassing RLS).
create table invite_codes (
  code text primary key,
  active boolean not null default true
);
alter table invite_codes enable row level security;

-- 2. The hook itself. Supabase Auth calls this immediately before inserting a
-- new row into auth.users; returning an "error" object aborts the signup and
-- the message is shown to the client. Returning '{}' allows it through.
create or replace function public.hook_before_user_created(event jsonb)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  submitted_code text;
  is_valid boolean;
begin
  -- Case/whitespace-insensitive — relatives typing this on a phone shouldn't
  -- get rejected over capitalization.
  submitted_code := lower(trim(event->'user'->'user_metadata'->>'invite_code'));

  select exists(
    select 1 from invite_codes where lower(code) = submitted_code and active = true
  ) into is_valid;

  if not is_valid then
    return jsonb_build_object(
      'error', jsonb_build_object(
        'message', 'Invalid invite code.',
        'http_code', 400
      )
    );
  end if;

  return '{}'::jsonb;
end;
$$;

grant execute on function public.hook_before_user_created(jsonb) to supabase_auth_admin;
revoke execute on function public.hook_before_user_created(jsonb) from authenticated, anon, public;

-- 3. Auto-create the matching `profiles` row on successful signup — the
-- well-established Supabase pattern (trigger on auth.users), not something
-- signup.html has to do as a separate step. Note: user_metadata (hook payload
-- key, above) and raw_user_meta_data (actual auth.users column, here) are two
-- names for the same underlying data, just in different contexts.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, relationship, preferred_language)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name', 'New User'),
    new.raw_user_meta_data->>'relationship',
    coalesce(new.raw_user_meta_data->>'preferred_language', 'en')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 4. Seed the first invite code — change this to whatever you want to tell people.
insert into invite_codes (code) values ('CHANGE_ME');
