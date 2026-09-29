# Client profiles and data collection

This change adds Data Collection Buyer and App / Website Client profiles to the existing Agentech account experience. Both require just organization/project name and contact name. Role and region are optional. The second profile can reuse the first profile's details.

## Local review

- `/data-collection`: collection service page, searchable scenario catalog, and buyer workspace entry.
- `/data-collection/workspace?preview=1`: local buyer workspace, profile setup, and draft briefs.
- `/account/service-profiles?type=development-client&preview=1`: simple setup for either client profile.
- `/account` and `/account/create-profile`: entries for both new client profiles.
- `/ai-service`: App / Website Client profile entry.

Development always uses `.data-collection-local/`, which is git-ignored. It does not write profiles or briefs to Supabase, even if production credentials are present. The preview identity works only with `NODE_ENV=development`, an explicit `preview=1`, and a loopback hostname. It never sets a login cookie or grants access to another account. Real signed-in accounts use separate files keyed by a hash of their verified identity. The local fixture is for synthetic preview data only.

## Supabase update

The owner applied the reviewed [SQL script](sql/service-client-profiles.sql). A read-only check confirmed both tables exist with RLS enabled, browser-role read access revoked, and server-role read access allowed. The script creates two tables:

The SQL file is the complete database setup, including constraints, indexes, permissions, and a verification query. `AGENTECH_SERVICE_PROFILES_ENABLED=1` is a separate website environment setting; it does not create tables or replace this SQL. The AIGC introduction page does not require another Supabase table.

1. `agentech_service_profiles`: one profile of each type per existing account.
2. `agentech_collection_briefs`: draft requirements linked to the same account's data buyer profile.

The script enables RLS, revokes direct browser access, grants only the operations needed by the server, and includes a verification query. It does not change `agentech_accounts`, `agentech_account_profiles`, authentication settings, or existing credit/robot roles. The composite foreign key prevents a brief from referring to another account's profile or to a development client profile.

The current site's signed Agentech HTTP-only session is the authorization source. Server APIs ignore any client-supplied account email, read ownership from that signed session, and filter database operations by it. The SQL does not pretend the site's session is a Supabase browser JWT; it follows the existing server-only Supabase request pattern.

## Production configuration

1. Review and run `docs/sql/service-client-profiles.sql` in Supabase. Confirm the verification query returns RLS `true`, anon and authenticated access `false`, service-role access `true` for both tables.
2. Set the server-only environment variable `AGENTECH_SERVICE_PROFILES_ENABLED=1` in the deployment environment. Existing `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and the existing signing secret remain in use. Do not create a `NEXT_PUBLIC_` service key.
3. Publish the verified website change when authorized, then test a real sign-in and owner-isolated profile/brief save. `AGENTECH_SERVICE_PROFILES_ENABLED=1` has been added to the Vercel Production environment for this release; it takes effect on the next deployment. Local preview checks do not verify a production save.

Local fixture data is not migrated automatically. Profile creation is not a review or approval process. Briefs remain drafts; pricing, orders, payments, collection execution, and delivery are not activated by saving a profile or brief. The App / Website Client profile is identity/context setup; the existing website inquiry flow remains available for project requests.
