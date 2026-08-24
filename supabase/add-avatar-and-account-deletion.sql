-- Settings page support: avatar storage + a safe self-service account-deletion
-- function. See schema.sql for the avatar-as-data-URI reasoning.

alter table profiles add column avatar_data_url text;

-- Self-service "delete account": clears identity + own content, does NOT
-- disable the login itself (that requires the Admin API / service_role key,
-- which the browser can never hold — see build_status memory / chat for why
-- a direct auth.users manipulation was deliberately avoided). security definer
-- so it can touch comments/likes belonging to auth.uid() regardless of which
-- RLS-restricted caller invokes it — but it ONLY ever acts on auth.uid()
-- itself, never a caller-supplied id, so it can't be used to affect anyone else.
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  -- Soft delete, not a real DELETE — same reasoning as single-comment delete
  -- in add-comment-replies.sql: preserves any replies other people made.
  update comments set deleted_at = now() where user_id = auth.uid() and deleted_at is null;
  delete from likes where user_id = auth.uid();
  update profiles
    set display_name = 'Former member', relationship = null, avatar_data_url = null
    where id = auth.uid();
end;
$$;

grant execute on function public.delete_my_account() to authenticated;
revoke execute on function public.delete_my_account() from anon, public;
