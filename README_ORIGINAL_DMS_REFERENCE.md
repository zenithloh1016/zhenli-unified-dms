# ZHENLI Document Management System — Web + Android

Version 1.0 • 17 October 2026

A new, independent DMS implementation. **One codebase, two outputs:** a browser website (GitHub Pages) and an installable Android debug APK (built by GitHub Actions). Both share the same private Supabase cloud database and private document storage.

**What is in this ZIP:** working application source, Supabase SQL setup, deployment workflows, and instructions. **What is not yet created:** a live website or APK binary. Those require a Supabase project and a GitHub repository owned by you. The Android build is performed by GitHub Actions after you upload these files.

## Features

- Create a company manually, or **bulk import Excel Master Listing (`.xlsx`)**.
- Automatically create **12 default root folders** on every new company:
  1. Incorporation
  2. Board & Members' Resolution
  3. Annual Return
  4. Financial Statements
  5. Directors, Members & Secretaries
  6. Allotment of Shares
  7. Transfer of Shares
  8. Registered Address
  9. Business Address & Nature
  10. Other Statutory Matters
  11. Correspondence
  12. Beneficial Owners (eBOS / BO supporting documents)
- Unlimited nested subfolders, rename and permanent delete (files inside deleted folders are also deleted).
- Upload multiple PDFs, images, Word/Excel documents or other files, then view, download, rename or delete files.
- Search company names and registration numbers.
- Private user sign-in, private storage bucket, per-user PostgreSQL row-level security (RLS).
- Same account synchronizes across browser and APK on different devices with internet access.
- Excel import supports different worksheets, header locations, column choices and data-start rows. Names matching existing company names (ignoring case and leading/trailing whitespace) **will not create duplicates**. Import restores missing standard folders if any were deleted or renamed.

## A. Set up cloud storage and database (once)

1. Create a project at **https://supabase.com/dashboard**.
2. In **SQL Editor → New query**, copy and run the full contents of `supabase/setup.sql` once.
3. Check **Table Editor** shows `companies`, `folders`, `documents`.
4. Check **Storage** shows a bucket called `dms-private` that is **private** (not public).
5. Under **Project Settings → API Keys / Connect**, copy the **Project URL** and the **Publishable key** (`sb_publishable_...`) or the older `anon` public key. **Never use the service_role or secret key in the frontend.**
6. Under **Authentication → Providers → Email**, enable email/password authentication. Confirm-email verification is recommended; follow verification links received by email. If you disable email confirmation for a quick test, enable it again before putting client documents in the system.
7. After website deployment, set **Authentication → URL Configuration → Site URL** to `https://YOUR-USERNAME.github.io/YOUR-REPO/`. Add that URL as an allowed Redirect URL if needed. Supabase may initially redirect verification messages to localhost unless you configure it.

**Security:** All client data is segregated per Supabase user account. You must use the *same email login* on web and APK to see the same portfolio. This initial version does not implement multi-staff sharing, admin invites or role permissions. Do not share a password with staff; ask for a proper multi-user permissions enhancement first.

## B. Upload this source to GitHub (phone-only method included)

1. Create a **new GitHub repository** at https://github.com/new , e.g. `zhenli-dms`. For the simplest free GitHub Pages workflow, use a **public repository**. The repository contains source code, **not your Master Listing, documents, passwords or database secret keys**.
2. Add the **contents of this ZIP** to the repository root, preserving `src/`, `public/`, `supabase/`, and **`.github/workflows/`**. Do not upload the ZIP unchanged and expect it to deploy — GitHub must see the extracted files.
3. **Using only an Android phone:** In Chrome, open the repository, enable **Desktop site** if necessary → **Code → Codespaces → Create codespace on main**. In the cloud editor's Explorer, upload this ZIP (downloaded from ChatGPT) to the workspace. In the Codespaces terminal, run:

   ```bash
   mkdir -p /tmp/zhenli-dms-extract
   unzip -o ZHENLI_DMS_Web_Android.zip -d /tmp/zhenli-dms-extract
   cp -a /tmp/zhenli-dms-extract/ZHENLI_DMS_Web_Android/. .
   rm -f ZHENLI_DMS_Web_Android.zip
   git add .
   git commit -m "Initial DMS web and Android deployment"
   git push origin main
   ```

   If GitHub Codespaces is not included or available on your account, you can instead extract the ZIP with a phone file manager and upload the extracted folders/files using a computer. Avoid uploading private client information to a public repo.

4. In the repository open **Settings → Secrets and variables → Actions → Variables → New repository variable**. Create these **exact** repository variable names:

   | Name | Value |
   | --- | --- |
   | `VITE_SUPABASE_URL` | Your Supabase project URL, e.g. `https://abcxyz.supabase.co` |
   | `VITE_SUPABASE_ANON_KEY` | The Supabase **publishable / anon public** key |

   These two values are deliberately included in the website and APK code. They are public identifiers, **not private secret keys**. The SQL row-level and Storage policies protect the client records.

5. Open **Settings → Pages → Build and deployment → Source**, select **GitHub Actions**.
6. Go to **Actions → Deploy DMS Web and Build Android APK → Run workflow**, or push to `main`. If you made the initial push before setting variables, run the workflow again after adding them.

## C. Your two outputs

**Website** — The `web` job deploys to:

`https://YOUR-USERNAME.github.io/YOUR-REPO/`

Works on both laptop browsers and Android phone browsers, with the same Supabase login.

**Android APK** — Open the successful GitHub Actions workflow run → scroll to **Artifacts** → download **ZHENLI-DMS-Android-Debug-APK** → extract that artifact ZIP → transfer/open `app-debug.apk` on the phone → allow installation from the browser/file manager for this APK → install → log in with the same account used on the web.

This is a **debug-signed APK**, suitable for personal/internal testing, *not* a production-signed Google Play release. New debug builds can use a different signing certificate across clean workflow runs, so you may need to uninstall the earlier debug build before updating. To preserve installed user settings between versions, create a persistent release-signing key and a signed release workflow later. Supabase files are not stored in the APK and remain in the cloud.

If Android displays a protection or unknown-source warning, verify that the file is from **your own GitHub workflow run**. Never install an APK from an unknown sender.

## D. How to import a Master Listing

1. Sign in and click **Import Master Listing**.
2. Choose your `.xlsx` file (not `.xls` or PDF). The importer reads each sheet in the browser, not a server.
3. Choose the correct **Worksheet**. Choose the column containing **Company Name** and, if available, **Company Registration Number**.
4. Set **First data row** to the row containing the **first company** (not the headings).
5. Review the sheet preview and number of companies detected carefully. Selecting the wrong name column can create unwanted company records.
6. Click **Create company folders**. Each company is created with its 12 folders. Already existing names are left intact. Repeating the same import is safe and does not create duplicate companies with the same normalized name.
7. Larger files are processed 5 names at a time and may take longer. Keep the page open until the final count is shown.

**Important:** The Excel importer creates companies and blank standard folder structures; it does **not** import PDFs/Word documents referenced by your Master Listing, and it does not move any pre-existing laptop files automatically. Upload such documents into the relevant folders afterward. It handles .xlsx up to 20 MB and up to 5,000 company rows at a time.

## E. File storage and quotas

- Free Supabase currently includes **1 GB stored files** and **500 MB database**. Quotas and availability can change; verify https://supabase.com/pricing .
- The Free plan has a **50 MB maximum single-file upload** limit. This app blocks larger files.
- Client files require an internet connection. This build does not support offline document caching.
- **Deletion is permanent**. There is no recycle bin, version history or automatic file recovery. Back up important statutory records separately. The app tries to delete the storage objects before database metadata, but a network failure can leave incomplete cleanup; retry and inspect Storage after an interruption.
- Review Malaysian PDPA/confidentiality, firm document retention policy, customer consent, 2FA and backup arrangements before production use. Free tiers are designed for testing, not a substitute for formal corporate storage governance.

## F. Local development (optional)

Requires Node.js 22+ and npm:

```bash
cp .env.example .env
# Edit .env with YOUR Supabase project URL and public key.
npm install
npm run dev
```

To create Android locally (requires Android SDK and Java 21):

```bash
npm run build
npx cap add android
npx cap sync android
cd android && ./gradlew assembleDebug
```

## Troubleshooting

- **SQL error about policy already existing**: run `setup.sql` only once in a new project. Do not run it repeatedly; policies are not set up for repeated migration.
- **Email confirmation link opens localhost**: configure Supabase Auth Site URL as described in section A.
- **Website reports Setup needed**: GitHub Actions variables are missing or the site was built before variables were added. Re-run the workflow.
- **APK shows no companies after login**: check you used exactly the same account and project configuration; verify SQL completed successfully and the 3 public tables exist.
- **Upload fails**: confirm `dms-private` bucket exists, is private, and policies were added; file limit is 50 MB.
- **Build fails**: use the error log in the matching GitHub Actions job. After a build failure, update dependencies only when necessary and keep Capacitor core / Android / CLI on the same major version.
- **App opens but Excel import returns no names**: switch worksheet and select the correct name column / first data row in the preview before confirming.
- **Android installation fails when updating the debug APK**: uninstall the prior debug build and install the new one; the documents remain on Supabase. A properly signed release build is the correct long-term approach.

## Related official documentation

- Supabase row-level security: https://supabase.com/docs/guides/database/postgres/row-level-security
- Supabase Storage policies: https://supabase.com/docs/guides/storage/security/access-control
- GitHub Pages with Vite: https://vite.dev/guide/static-deploy.html
- Capacitor Android setup: https://capacitorjs.com/docs/android

## New Beneficial Owners folder (DMS update)

The **Beneficial Owners** folder is the twelfth default root category for every company. The updated web and Android DMS automatically checks **all companies belonging to the signed-in user** and creates the missing BO folders upon sign-in/refresh, and after a new company or Master Listing import. The **Documents → Ensure BO folders** button can safely retry the process. The operation only inserts missing root folders; existing folders, documents, signatures and storage paths are not modified. Existing root folders named `Register of Beneficial Owners`, `Beneficial Ownership` or `eBOS` are recognized and not duplicated.

For a one-time optional database-wide backfill, the Supabase administrator may run [beneficial_owners_folder_backfill.sql](supabase/beneficial_owners_folder_backfill.sql) in the existing project's SQL Editor. **Do not rerun the whole `setup.sql` in a populated project.** The new `setup.sql` creates 12 folders for fresh projects.
