# FlowBiz One — Customer-isolated Deployment (Option A)

Status: work in progress, not production approval.

Each customer receives its own website and customer-owned Supabase PostgreSQL/Auth/Storage project. Never point a paying customer at the existing FlowStock demo Supabase project.

## Setup steps
1. Create a NEW customer-owned Supabase project and agree on cloud plan, region, ownership, DNS, and backup retention. Do not copy demo users or secrets.
2. Apply tested version-locked migrations to that new project only, following the source migration order. Confirm RLS, Auth sign-in methods, Storage bucket, function grants and tenant boundaries.
3. Configure customer-specific HTTPS URL and Supabase Auth callback/redirect allowlist. Provision the first Admin securely.
4. From the repository root, build customer static assets, **outside the source tree**:

```sh
node scripts/build-customer-site.mjs --supabaseUrl=https://CUSTOMER-PROJECT.supabase.co --publishableKey=sb_publishable_PUBLIC_KEY --siteUrl=https://customer.example.com/flowbiz/ --output=/tmp/flowbiz-customer
```

5. Publish only generated static files to the customer's own website/repository. Do not publish database passwords or service-role secrets.
6. Run existing UI/regression checks, then customer-specific browser UAT across every role, stock/invoice path, exports and mobile.
7. Register PRE_GO_LIVE backup; rehearse restore to isolated TEST project and reconcile balances, invoice totals and POD objects before production acceptance.

## Release gates
- Correct project URL and website URL; fail-closed authentication
- Strict RLS and RPC tenant/role isolation verified by negative tests
- Every transaction/movement, GP, delivery and reversal test passes
- Successful full backup and verified independent restore
- Signed customer UAT report with zero open critical defects

The builder changes only frontend URLs/public key and HTML CSP connect origins, not business formulas or database schemas. Never claim UAT 100% from static source checks alone.
