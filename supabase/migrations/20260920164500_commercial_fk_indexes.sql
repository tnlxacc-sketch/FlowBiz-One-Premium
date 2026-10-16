-- Cover foreign keys introduced by the commercial tenant and POD release.
create index if not exists platform_admins_created_by_idx on private.platform_admins(created_by);
create index if not exists tenant_invites_created_by_idx on private.tenant_invites(created_by);
create index if not exists delivery_documents_uploaded_by_idx on public.delivery_documents(uploaded_by);

