# ZHENLI Unified Document Management System · V1.0

**New separate web + Android project, based on your original uploaded packages.** It does not modify your existing `zhenli-dms` GitHub repository or Tencent EdgeOne signing deployment.

## Included modules

- **Overview**: portfolio count, document count and one-touch navigation.
- **Documents**: screenshot-inspired responsive UI, company name/registration search, nested statutory folders, cloud file upload/view/download, add/rename/delete, Excel Master Listing import and automatic eleven folders per company.
- **Tasks**: the actual ZHENLI Secretarial Task Hub V3 frontend from `ZHENLI_Secretarial_Task_Hub_V3_EdgeOne_Deploy.zip`, with authenticated Supabase synchronization bridge adapted from `ZHENLI_DMS_TaskHub_Signing_Integration_Update.zip`. Kanban, company tasks, AR/AFS dates, calendar, recurring tasks, reminders and JSON backup/import stay in the original Task Hub interface.
- **Signing**: connects to the actual EdgeOne signing **website** `https://zhenli-sequential-signing.edgeone.cool/` using an embedded viewer with an **Open in-app browser** fallback. Existing signing requests, signed PDFs and sender email settings are handled by the existing EdgeOne deployment, not copied or recreated. EdgeOne may block iframe embedding; the browser fallback is expected in that case.

## Important safety notes

- Your uploaded `TENCENTEDGEONE (Sequential Signing).zip` contains real client PDFs/audit logs. **None of these confidential records are included in this project**. The signing website stays unchanged.
- The EdgeOne URL you supplied contains temporary `eo_token`/`eo_time` query parameters. **Never commit that URL to GitHub or embed it in an APK.** This source only embeds the token-free domain. When EdgeOne requires a time-limited access link, paste a fresh link in the Signing tab; it is kept in the current app session, not uploaded to Supabase.
- Task Hub on its old EdgeOne URL stores tasks in that website's browser localStorage. No web application can secretly extract that data from another domain. On the OLD Task Hub site choose **Export backup**, then in the NEW DMS Task Hub tab choose **Import backup**. After SQL migration, Task Hub saves it under your DMS account.
- The DMS plus embedded Task Hub use the same Supabase login for web and Android. Signing remains a separate login/service. There is **no automatic signed-PDF-to-DMS filing, single sign-on, or synced signing status** without authenticated server-side API integration.
- DO NOT publish your Master Listing, signed PDFs, signing ZIP or database secret/service-role key to a public GitHub repository.

## Step 1: Create or use Supabase backend

1. Open https://supabase.com/dashboard and create a new project (or select a configured existing DMS database).
2. **New project**: In SQL Editor run `supabase/setup.sql` once. It creates the private companies/folders/documents tables, 11 starter folders per company, private bucket `dms-private` and row-level security. **Existing DMS project**: Skip this main SQL if already installed.
3. **Both new and existing project**: Run `supabase/task_hub_sync.sql` once, to enable private synced Task Hub data. Safe to run again if necessary.
4. Enable Email authentication and review allowed-site URLs, policies and backups. Save your **Project URL** and **publishable (anon) key**. Never put a secret service-role key in a client app.

## Step 2: New GitHub repo and build (works via Android phone)

1. Create a **NEW** GitHub repository, e.g. `zhenli-unified-dms` (do not reuse an existing signing or Task Hub repo). Enable GitHub Pages from **GitHub Actions** in Repository Settings → Pages.
2. On mobile Chrome open the new repository, enable **Desktop site**, select **Code → Codespaces → Create codespace on main**.
3. Upload this ZIP to the new Codespace root, then enter (replace the ZIP name only if you renamed the downloaded file):

```bash
unzip -o ZHENLI_Unified_DMS_Web_APK_Source_V1.zip -d .
rm ZHENLI_Unified_DMS_Web_APK_Source_V1.zip
git add .
git commit -m "Create new ZHENLI Unified DMS web and APK"
git push origin main
```

If the new repo is empty and Codespaces isn't available, initialize it with a README when creating it or use GitHub file upload for the extracted ZIP contents. The ZIP contains the app SOURCE, not an already compiled APK.

4. GitHub → **Settings → Secrets and variables → Actions → Variables**, create:

| Variable | Value |
|---|---|
| `VITE_SUPABASE_URL` | Your actual `https://PROJECT.supabase.co` address |
| `VITE_SUPABASE_ANON_KEY` | Supabase browser-safe publishable/anon key |

5. GitHub → **Actions → Deploy DMS Web and Build Android APK → Run workflow**. Watch the **web** and **android** jobs separately. The website publishes to `https://YOUR-GITHUB-NAME.github.io/zhenli-unified-dms/` (substitute your actual repository name). No app can be deployed from here without access to your GitHub credentials/project.
6. After the Android job succeeds, select **Artifacts → ZHENLI-DMS-Android-Debug-APK**. Download and unzip the artifact, then install `app-debug.apk`. The app ID `com.zhenli.unifieddms` is separate from your previous DMS app, so it can be installed alongside the old version.

This workflow creates an **internal test/debug APK**, not a production-signed Play Store binary. A stable signed release needs a keystore configured as a GitHub Secret. The APK artifact is generated by GitHub Actions after the workflow succeeds, not contained in this source ZIP.

## Step 3: First launch and import your master list

1. Sign in with the same email/password in web and Android.
2. Documents → **Import Master Listing** → select your `Master Listing(20261015-071955).xlsx` on your phone or computer.
3. Confirm the worksheet `Master Listing`, name column **B**, registration number column **C**, first data row **2**, and the preview count **85 unique companies** (86 numbered rows, SILVERSPOONS duplicated). Click **Create company folders**. The spreadsheet is selected locally through the browser and only chosen names and registration numbers are uploaded to your account.
4. Open Tasks and verify the **Cloud sync active** status after `task_hub_sync.sql` was run. Export old tasks from the old Task Hub browser and import the JSON here once. Confirm it appears on both web and Android. This sync uses last-write-wins; avoid concurrent editing on two devices.
5. Open Signing. Try the embedded viewer; if it is blank, choose **Open in-app browser**, or paste a fresh **protected EdgeOne access link** in the Signing form (not GitHub). The one you shared is temporary and cannot be made permanent by the DMS.
6. Test with one nonconfidential sample file and one sample task. Download a signed PDF manually from EdgeOne and upload it into the appropriate DMS statutory company folder.

## Source layout

- `src/main.js`: DMS frontend, screenshot layout, integration panels and import.
- `src/integrated-modules.js`: protected Task Hub iframe/Supabase bridge.
- `src/style.css`: mobile and desktop design.
- `public/task-hub/`: original Task Hub V3 website with the sync bridge.
- `supabase/setup.sql`: document store setup and private RLS.
- `supabase/task_hub_sync.sql`: private task storage setup and RLS.
- `.github/workflows/deploy.yml`: web publishing and debug APK build jobs.
- `capacitor.config.json`: Android app ID and bundled web configuration.

## Limitations and verification

- JavaScript syntax and source structure were checked. The current session could not fetch npm packages (installation timed out), so **a compiled web site and Android APK have not been built or tested** here.
- GitHub Actions deployment, EdgeOne iframe permission, EdgeOne protected access, and actual Supabase database login must be verified in your environment.
- Cloud document retention, document versioning, recovery backups, user roles and confidential-data compliance need separate production hardening. A delete is permanent by default, so keep statutory backups.

## Constitution folder — standard category 13 (October 2026)

The **Documents** module creates a root-level **Constitution** folder for every company.

- New companies: `supabase/setup.sql` now defines Constitution as folder **13**. If your Supabase database was installed earlier, the authenticated DMS app independently adds missing Constitution folders after you sign in, so you do not need to reset your database.
- Existing companies: an idempotent sync runs after each signed-in portfolio refresh. It recognises root folders already named *Constitution*, *Company Constitution*, or *Memorandum and Articles of Association* as equivalent and will not create another one. If needed, open **Documents → Ensure Constitution folders** to retry and see how many were created, already present or failed.
- Optional database-wide repair: `supabase/constitution_folder_backfill.sql` in Supabase SQL Editor. This inserts only missing folders and does **not** delete, rename, or relocate files. The app's automatic sync normally makes this optional.
- For future Supabase company-creation RPCs on databases installed before this revision, run the updated `create_company_with_folders` function block from `supabase/setup.sql` in the SQL Editor. Running that block does not affect existing files.
- No real company credentials, documents or database rows are committed to GitHub. The source cannot independently confirm the live database backfill until a signed-in user opens DMS.

