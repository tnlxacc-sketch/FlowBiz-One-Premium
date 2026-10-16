-- Cover access request foreign keys and use one SELECT policy per role/action.
create index if not exists idx_access_requests_user on public.access_requests(user_id);
create index if not exists idx_access_requests_company on public.access_requests(company_id);
create index if not exists idx_access_requests_reviewed_by on public.access_requests(reviewed_by);

drop policy if exists access_request_self_select on public.access_requests;
drop policy if exists access_request_admin_select on public.access_requests;
create policy access_request_select on public.access_requests for select to authenticated
  using (
    user_id=(select auth.uid())
    or (company_id=(select public.current_company_id()) and (select public.current_app_role())='ADMIN')
  );

