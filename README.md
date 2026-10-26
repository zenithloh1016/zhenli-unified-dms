## Master Listing unique Company Name and centered registration dates

The table uses the original imported **Company Name** data as its single
second column immediately after **No.**. The duplicate derived Company
column is removed; Registration No. is similarly shown only once. This
is display-only: no saved company details, documents or folders are deleted.

The **Date of Registration**, **Registration Date** and **Date Registered**
headers are recognized as date fields, so numeric Excel serials and supported
text dates display as **DD/MM/YYYY**. Registration numbers remain unchanged.
Every Master Listing header and table value is center-aligned, including
normal and full-screen views. Existing blank cells continue to show **N/A**.

## Master Listing clean table (20 October 2026)

The Master Listing table and import preview show exactly one **No.**
column directly before **Company**. The displayed numbers come from the
original Excel `No.`, `Bil.` or `S/N` column when present, otherwise
fall back to the original row's sequential position. The redundant `#` column
and duplicate list-number fields are hidden without deleting source data.
All company-information columns remain editable.

Dates that can be reliably recognized (including formatted Excel serials and
text dates in DD.MM.YYYY, YYYY-MM-DD, DD-MMM-YYYY or DD/MM/YYYY) are now
displayed as **DD/MM/YYYY** in the table, editor and CSV export. **Financial
Year End (FYE)** is explicitly recognized, including `F.Y.E.` and
`Financial Year End`, and is center-aligned in normal and full-screen tables.
The **No.** column and other recognized date columns are centered as well. Actual
imported dates are stored using this format. Non-date figures, company
registration numbers, paid-up capital and share quantities are unaffected.

Empty company-information cells display **N/A** in old saved listings and
exports. New imports, and individual edited fields, store **N/A** in place
of blanks. The DMS does not silently overwrite previously saved listings;
existing records can be re-imported or saved through the normal editor.

Existing company folders, uploaded statutory documents and the rest of the
DMS modules are unaffected.

## Repairing previously imported Excel date serials (20 October 2026)

Older Master Listing data in DMS may contain Excel serials even if the workbook
reader was fixed later. The Master Listing table now **displays** plausible
serials in unambiguously date-related columns as DD/MM/YYYY, leaving
registration numbers, issued shares, capital, payment amounts and other numeric
columns untouched. This display is non-destructive.

When an older saved listing contains such serials, select **Save corrected
dates** in the Master Listing tab to review representative changes and
confirm conversion. DMS backs up the original listing to the signed-in
user's existing private Master Listing history before writing a corrected
version. Exports use displayed date values as well.

If the older listing has no original Excel number-format or 1904-date-system
metadata, its precise displayed format cannot be reconstructed from a serial
alone. The repair assumes the 1900 system and DD/MM/YYYY; to reproduce a
distinct source format (e.g. DD.MM.YYYY), re-import the original .xlsx file.
New imports use Excel cell formatting where present and otherwise infer dates
only from clearly date-related column headers. Always verify dates used for
statutory filings before lodging.

## Master Listing full-screen table and Excel date display (20 October 2026)

Use **Master Listing → Full screen ⛶** to expand the editable company table
to the whole browser viewport. Unlike the compact view (six data columns at
a time), the full-screen view displays every imported worksheet column and
up to 40 companies per page. Scroll horizontally/vertically, navigate pages,
and select **Edit** to change a company's fields. Select **Exit full screen ✕**
or press Escape to restore the normal navigation.

The local `.xlsx` reader now loads Excel cell styles and number formats from
`xl/styles.xml` before converting date serials into displayed text. It handles
explicit date formats such as `dd/mm/yyyy`, `dd.mm.yyyy`, and `dd-mmm-yyyy`,
including the Excel 1900 and 1904 date systems. Text dates stay as entered.
Dates are saved to the Master Listing as these formatted strings and shown
unchanged after reopening. Older listings imported as serial numbers need to
be **re-imported from the original Excel workbook** (after confirming the
backup prompt). Excel's built-in locale-dependent short dates cannot always
be determined exactly from the file alone; check these in the preview.
If only the compatibility Excel reader can open a workbook, the Master Listing
tab will stop instead of silently changing date formats; resave the file as
an unprotected `.xlsx` workbook in Microsoft Excel and import again.

## Master Listing tab: editable full company data (20 October 2026)

**Master Listing** is a dedicated DMS tab next to Documents. It preserves
all imported columns instead of only names and company registration numbers.
Select **Import Excel**, choose an .xlsx workbook, select the worksheet,
heading row, first company row and name/registration columns, then review the
row/column preview before confirming. The parser prefers a worksheet named
Master Listing and falls back to the existing compatibility Excel reader.
Imports are limited to 5,000 companies, 200 fields and 20 MB input/JSON.

Company names, incorporation data, FYE, AR/AFS deadlines, contacts, secretarial
notes, amounts and every other worksheet field are kept as editable text.
Search across all fields, paginate companies, scroll through columns and
choose **Edit** to modify any company field. **Save company information**
writes the updated listing back to private Supabase Storage. Use **Export CSV**
to make a spreadsheet-readable copy of the current listing.

No database migration is needed: the file is saved under
`<signed-in-user-id>/master-listing/current.json` in the existing
`dms-private` private Supabase bucket. Before replacing an imported listing,
the previous listing is backed up under the same account prefix in
`master-listing/history/`. Re-import only after confirming; a normal edit
changes the private listing without moving/renaming company documents.

Matching existing company records show a **Documents** button. The optional
**Sync missing company folders** operation requires confirmation and uses the
existing `create_company_with_folders` function for companies not already
matched. Importing/editing the listing alone does not modify company/folder
metadata, statutory documents, Task Hub or Annual Return details. A separate
active account/session may overwrite edits to the listing; avoid simultaneous
updates from multiple devices until per-row concurrency control is added.

## Word and Excel document handling (20 October 2026)

Uploaded Word and Excel files remain in the same company document folders.
Both the **Edit in DMS** and **Open with installed app** functions have been
removed at the user's request. Use **Download** for Word and Excel files;
users can open the downloaded copy with their preferred Office application.
Clicking an Office filename in Documents now invokes the existing Download
workflow. The DMS does not edit or automatically save changes to these files.

Existing private uploads, PDF preview, company folders, Register Book ZIP
import, Annual Return generator, Task Hub and signing integration are
otherwise unaffected.

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

# UNICOSEC Document Management System

Please read **[START_HERE.md](START_HERE.md)** for the new combined web and Android build, Supabase setup, Task Hub cloud sync migration, and Sequential Signing EdgeOne access.

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
