## Register Book folders and bulk ZIP filing (20 October 2026)

**Register Book** is standard root category **16** under Documents for every company.
The authenticated DMS checks the company portfolio during refresh and adds only
missing Register Book folders. New companies also receive this folder from the
updated `create_company_with_folders` SQL function, or from the DMS client when
the database still has the older function. Existing PDFs, folders, and company
records are never moved, renamed, replaced or deleted.

**Bulk import:** Documents → Companies → **Import Register Books ZIP**.
Select a ZIP (up to 80 MB compressed, max 500 supported files, max 350 MB expanded)
containing company-named PDF, XLS/XLSX or DOCX Register Books, such as:
- `FENG YUAN AGRICULTURE (M) SDN BHD/Register Book.pdf`
- `Register Book_SILVERSPOONS SDN BHD.pdf`
- `202401051906_Register Book.pdf`

The preview associates each archive file with an existing company by verified
name or registration number (and may inspect page 1 of text-based PDFs when
filenames are generic). It never silently assigns an ambiguous match or creates
a new company. **Review the match list before confirming.** Only matched
documents are uploaded to each company's private `Register Book` folder.
Unmatched/unsupported files are reported and skipped; matching name and file
size in the destination are treated as duplicates and not re-uploaded.

ZIP files are read locally in the browser/WebView; only selected matched files
are uploaded to the signed-in user's private Supabase document storage.
Scanned PDFs with generic names may need a company-named ZIP path. The feature
does not change Annual Return particulars, and there is **no Register Book import
inside Annual Return**. Company registries and BO data must still be verified
against current statutory records. If an account encounters folder permission
issues, select **Ensure Register Book folders** in Documents and check the
database RLS setup.

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
