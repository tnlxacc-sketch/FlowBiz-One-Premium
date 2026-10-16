# FlowBiz One — Commercial Production Release Gate (2026-10-13)

## Release decision
**NOT YET APPROVED FOR CUSTOMER PRODUCTION.** Keep existing production branch and customer/demo data unchanged until the gates below pass.

## Verified against connected services on 2026-10-13
- GitHub source: `tnlxacc-sketch/FlowStock`; frontend `index.html` identifies FlowBiz One and loads app.js?v=1.17.7.
- Supabase project `ifanefgaiuzkbjtttiqn` reports `ACTIVE_HEALTHY`; public tables have RLS enabled.
- Live data counts from SQL: 2 companies, 4 app user profiles, 5 auth users, 0 registered backup archives, 0 restore verifications.
- Read-only integrity checks returned zero negative stock, over-allocation, duplicate stock balance keys, duplicate order numbers, and duplicate invoice numbers **on existing data**. This is not a passing transaction-flow UAT.
- Security Advisor flagged 54 authenticated-executable SECURITY DEFINER functions (requires function-by-function authorization review; do not blanket revoke) and 2 private tables with RLS but no policy (INFO; private schema may intentionally rely on lack of direct access).
- Browser E2E and actual GitHub Pages accessibility were **not verified**; web fetch failed.
- No data migrations, customer records, authentication records, or stock transactions modified by this audit.

## Blocking gates
1. **Backup / Restore: FAIL** — `private.backup_registry` has zero archives and zero restore verification. Use `docs/BACKUP_RESTORE_RUNBOOK.md` and restore into a separate TEST Supabase project, never production.
2. **Auth / Tenant isolation: NOT TESTED** — complete positive and negative UAT per role, cross-tenant forbidden access, admin provisioning and limit enforcement.
3. **RPC security: REVIEW REQUIRED** — inspect source of each exposed SECURITY DEFINER function, direct-grant permissions, auth checks, tenant checks, path and search_path protections; demonstrate denied cross-role/cross-tenant attempts.
4. **End-to-end transactions: NOT TESTED** — receipt → stock → order → allocation → issue → transfer → delivery/POD → invoice GP, reverse, retry and closed-period cases.
5. **Frontend / Deployment: NOT TESTED** — browser login, button and field wiring, JS console errors, mobile, tablet, print/export, Pages workflow checks and deployed asset hashes.
6. **Operational readiness: NOT TESTED** — test real customer onboarding, training, support, recoverability, commercial licensing and billing terms.

## Rollout strategy
- Keep `main` unchanged until tests pass.
- Carry out isolated UAT with generated test data and dedicated test Supabase, not a reset of existing databases.
- Fix defects in a release branch with reproducible tests; perform staged deployment and capture signed UAT evidence.
- Start **controlled pilot** only after tenant isolation, essential transaction UAT and verified backup; start **customer production** only after every critical gate passes.
- Do not represent automated tests, previous README claims or synthetic 500k aggregation as full real-world UAT.

## Source references
- `docs/UAT_CHECKLIST.md`
- `docs/COMMERCIAL_RUNBOOK.md`
- `docs/BACKUP_RESTORE_RUNBOOK.md`
