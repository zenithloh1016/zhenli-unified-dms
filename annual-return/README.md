# ZHENLI Annual Return PDF — Web and Android

Standalone local-only bilingual Annual Return **particulars review** PDF generator, based on the user's revised Google Apps Script template (9 October 2026) and latest structured example (13 October 2026). The **138 sections/headings/field rows** in `src/template.json` have their client values cleared and personal names removed. No client data, directors' NRICs, live database records or Google credentials are committed.

## Use

1. Open **https://zenithloh1016.github.io/zhenli-unified-dms/annual-return/** or install the separate **ZHENLI Annual Return** APK from the GitHub Action artifact.
2. Enter company details or **Import .gs / JSON**. The import parser recognises `const AR_SINGLE_COMPANY = {...};` and optional `const AR_SIGNATURE_DIRECTOR = {...};`; it never executes Apps Script code.
3. Review the bilingual particulars section by section. Blank source values remain blank in the editor and appear as *NOT PROVIDED / 未提供资料* in the PDF. Use Add field or Add section where necessary.
4. Enter the **one director** who will confirm the particulars (name, NRIC/passport, capacity). No signing date or separate signing acknowledgement is requested. There is no director's resolution or members' resolution component.
5. Click **Generate PDF**. Web browsers download the file and reveal a retryable direct download link; Android uses the native Share chooser to save to Files or Drive.
6. Export the source JSON if you need to edit it later. By design no client data is automatically stored on GitHub, Google Drive, Supabase, EdgeOne or in a server database.

## Security and scope

This is **not** the prescribed SSM lodgement format, not an MBRS/mTool submission file and does **not lodge** the Annual Return. A company secretary must verify source records, eBOS, current particulars, dates, and SSM requirements. The website is public but all client details are processed locally in the browser and are not intentionally transmitted. Avoid using shared devices; exported PDFs and JSON files may contain personal data and should be handled securely.

## Developer commands

```sh
cd annual-return
npm install
npm run test
npm run build
npx cap add android
npx cap sync android
cd android && ./gradlew assembleDebug
```

## Deployment

The parent DMS `.github/workflows/deploy.yml` builds this standalone site into GitHub Pages `/annual-return/`. The separate `.github/workflows/annual-return-apk.yml` builds the dedicated Android APK, without changing the DMS app ID or existing signing and document storage.

## Reference scripts

Sources in private ChatGPT Library:
- `/Annual Return Scripts (Sdn Bhd Companies)/Annual Return Review Form (revised)(1).gs` (master)
- `/Annual Return Scripts (Sdn Bhd Companies)/AURUMROCK_LABORATORY_SDN_BHD_Annual_Return_2027.gs` (latest structured example)

Company-specific scripts are **not bundled**, to prevent exposing private information on public GitHub Pages. Import them locally when required.

## V1.5 DMS integration (18 October 2026)

- The **Tax Identification Number (TIN)** row and **entire Company Review and Verification Notes** section are removed from the blank Annual Return review template and from older imported `.gs`/JSON drafts. This does not change original Google Apps Script files or any database records.
- The **Director Confirmation** form retains name, NRIC/passport and director capacity. The separate signing acknowledgement text and signing-date fields were removed from the editor, JSON export and generated PDF; a director signature line remains in the PDF.
- **Inside ZHENLI DMS:** sign in, choose the new **Annual Return** tab, and use the embedded generator. It works from the same bundled page files on the published DMS website and in the main DMS Android APK. It also continues as a standalone website / standalone Annual Return APK.
- **Data privacy:** No real company data is bundled; the iframe is same-origin and operates with local file input. Neither the DMS nor the Annual Return site auto-saves review drafts to Supabase. Export JSON before switching tabs, refreshing the DMS or signing out, and upload the finished PDF to the intended company folder under Documents yourself.
- **Build reproducibly:** `npm run build:integrated` in the DMS repository root builds the main DMS, generates the official MSIC catalogue and Annual Return V1.5 site, then bundles the latter under `dist/annual-return/`. `npm run android:sync` also synchronizes these assets into the main Android project. Both are performed in GitHub Actions.

## V1.4 clean fields and SSM MSIC 2008 (18 October 2026)

- The app starts directly from **Company Details**. There is no separate Company Profile.
- **Statutory Lodgement Deadline**, **Master Listing Internal Due Date**, **Register Last Updated**, and the related internal-vs-statutory deadline comparison are not shown or exported, even when importing older Apps Script / JSON drafts.
- The **Nature of Business / MSIC Code** field now lets users search and select up to **three** MSIC 2008 Ver.1 codes with English/Malay descriptions. It also accepts a manually verified SSM ROC code (5 digits with optional `e`, `i`, `u` suffix) because SSM ROC's special suffixes are not necessarily present in the national 5-digit dataset. Verify manual entries against the SSM list.
- Official SSM references: [BizCodEX](https://www.ssm.com.my/Pages/BizCodEX.aspx), [SSM ROC published code list](https://www.ssm.com.my/Pages/Publication/SSM%20MSIC%20Code/ROC/SSM%20MSIC%202008%20CODE%20-%20ROC.pdf).
- The catalogue is generated **at build/deployment time**, directly from the DOSM government's published [MSIC 2008 CSV](https://storage.dosm.gov.my/dictionaries/msic.csv), using `annual-return/scripts/build-msic.mjs`. The generated `public/msic-2008.json` is bundled into the deployed website/APK for offline searching. This is a versioned **official government-data snapshot**, not a live SSM API connection or automatic update of company details. DOSM data licence: CC BY 4.0, https://data.gov.my/data-catalogue/msic .
- In case the government CSV download or structure fails, the build stops instead of deploying a partial/fabricated code list.
- Selected codes appear in the bilingual PDF and editable JSON draft; company records and credentials remain local unless explicitly exported.


## V1.5 — integrated DMS Annual Return editor

- The DMS navigation now has a dedicated **Annual Return** tab, showing the embedded editor inside the signed-in DMS website and Android app. Its files are bundled at `dist/annual-return/` by `scripts/bundle-annual-return.mjs` during both web and DMS APK builds.
- Company Details is the first section; no separate Company Profile.
- Removed from the editor, imported legacy GS/JSON drafts, JSON exports and generated PDF: TIN, the whole **Company Review and Verification Notes** section, directors' **Date of Appointment**, secretary's **Date of Secretary Appointment**, members' **Date Entered as Member**, beneficial owners' **Date Became / Ceased as BO** and **Notice / BO Confirmation Dates** (and equivalent historic labels).
- The Director Confirmation retains the signature box, director name, NRIC/passport and capacity, but removes **signing date** and **Signing Acknowledgement**.
- Existing share-type, share-class and BO ownership dropdowns, multiple BO Criteria A–D selections, repeatable Charges/Directors/Members/BO entries and 3-code DOSM/SSM MSIC selector remain.
- **Privacy:** no private drafts or completed PDFs automatically sync to DMS storage or GitHub. Export a JSON draft before changing the DMS tab, then import it to continue. Downloaded review PDFs can be uploaded to the appropriate company folder under **Documents**.
- Existing Supabase documents, Task Hub and EdgeOne signing requests are unchanged. Only a review PDF is generated; no SSM submission or eBOS update occurs.


## DMS Documents company search and Annual Return V1.5

From **Documents → Companies**, select **Annual Return** on a company card, or open a company's folder and click **Generate Annual Return**. In **DMS → Annual Return**, search the same private Supabase Documents company portfolio by name or registration number, then click the matching company.

The DMS passes only the authenticated company's name and registration number to the bundled, same-origin Annual Return iframe via `postMessage`. No external API or public query-string transfer is used. The company identity populates **Company Details**, not any director, member, charge, or beneficial ownership information. Switching to a different company requires confirmation and starts with blank statutory particulars, preventing accidental reuse of another company's details. Your existing DMS Supabase data is **read-only** for selection and unaffected.

For this V1.5 form, TIN, Company Review and Verification Notes, Director signing date and Signing Acknowledgement are removed from the input, PDF and legacy .gs/JSON imports. Director Confirmation retains name, NRIC/passport, capacity and signature box.

**Storage:** Drafts and generated PDFs are not automatically stored in Documents. Export the editable JSON draft before changing tabs, and upload the final PDF manually to the correct company folder if desired. DMS document storage and EdgeOne sequential signing records are not migrated or modified.

