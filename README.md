# ZHENLI Unified Document Management System V1.0

Please read **[START_HERE.md](START_HERE.md)** for the new combined web and Android build, Supabase setup, Task Hub V3 cloud sync migration, and Sequential Signing EdgeOne access.

Includes revised Documents, Tasks, Signing and Overview tabs inspired by the provided screenshot. The previous DMS guide is preserved at `README_ORIGINAL_DMS_REFERENCE.md` for reference.


## Working Resolution folder (14th standard folder, 19 October 2026)

Each company now has a separate **Working Resolution** root folder alongside the existing **Board & Members' Resolution** folder. Use it for draft and working copies of resolutions; completed records may be filed separately in the Board & Members' Resolution folder.

- Existing companies: on the next authenticated DMS sign-in/refresh, the website or APK checks for the new root folder in your own Supabase portfolio and creates only missing ones. Open **Documents → Ensure Working Resolution folders** to retry and see counts.
- New companies: `create_company_with_folders` now includes Working Resolution as standard folder #14. For established Supabase databases that still have an older function definition, the authenticated DMS client also creates the new folder after import or company creation.
- Optional admin-wide backfill: `supabase/working_resolution_folder_backfill.sql`. Run it in Supabase SQL Editor if you want the new folders added even before users next sign in. To update the database-side company creation routine, rerun just the `create or replace function public.create_company_with_folders` definition from `supabase/setup.sql`.
- **Safety:** only missing root folder records are inserted. No existing company records, folder names, nested structures, signing requests or uploaded documents are renamed, moved or deleted. Folder inserts are idempotent and constrained by the Supabase root-folder unique index.

## Charges folder (15th standard folder, 20 October 2026)

Each company has a separate **Charges** root folder for registered charges, discharges/satisfaction documentation, SSM lodgements and related correspondence. It is not the existing Board & Members' Resolution folder or any other folder.

- **Existing companies:** the authenticated DMS automatically creates any missing Charges root folders on the next sign-in or refresh, without duplicating existing Charges roots. Under **Companies**, press **Ensure Charges folders** to run the check again and view created/existing counts.
- **New companies:** `supabase/setup.sql` includes Charges as standard folder #15. If the existing database-side `create_company_with_folders` function still creates only 14 folders, the DMS web or APK will create Charges when it refreshes.
- **Optional immediate Supabase-wide backfill:** run `supabase/charges_folder_backfill.sql` in the Supabase SQL Editor. To update the database function, run only its `CREATE OR REPLACE FUNCTION` definition from `supabase/setup.sql` (do not rerun unrelated database setup).
- **No data loss:** this is an additive, idempotent root-folder operation. Existing company names, folder structures, documents, and signing data are untouched.
