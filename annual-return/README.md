# ZHENLI Annual Return PDF — Web and Android

Standalone local-only bilingual Annual Return **particulars review** PDF generator, based on the user's revised Google Apps Script template (9 October 2026) and latest structured example (13 October 2026). The **118 sections/headings/field rows** in `src/template.json` have their client values cleared and personal names removed. No client data, directors' NRICs, live database records or Google credentials are committed.

## Use

1. Open **https://zenithloh1016.github.io/zhenli-unified-dms/annual-return/** or install the separate **ZHENLI Annual Return** APK from the GitHub Action artifact.
2. Enter company details or **Import .gs / JSON**. Register Books are imported centrally in **DMS → Documents**, not into Annual Return particulars. The import parser recognises `const AR_SINGLE_COMPANY = {...};` and optional `const AR_SIGNATURE_DIRECTOR = {...};`; it never executes Apps Script code.
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


## V1.6 — DMS-integrated statutory review (18 October 2026)

- The Annual Return generator is accessible inside **ZHENLI DMS → Annual Return**. The DMS website and Android distribution both bundle the same Annual Return V1.6 code; the standalone website and APK remain available.
- The Company Details-first editor excludes Tax Identification Number (TIN), Company Review and Verification Notes, Directors' Date of Appointment, Company Secretary Date of Appointment, Date Entered as Member, Date Became/Ceased as BO, and Notice/BO Confirmation Dates. These fields are stripped from imported historical .gs / JSON drafts in the review generator; the original files, company folders and records remain unchanged.
- BO criteria include **A, B, C, D and E**, with multiple selections allowed. **Criterion E:** a member who, under an agreement with another member, alone controls a majority of voting rights in the company. Reference: https://crmsv.ssm4u.com.my/ssmkb/SSM4UExternal?wiki_id=10046. SSM also has **Criterion F**; assess all applicable BO criteria before SSM lodgement.
- Director Confirmation contains the director name, NRIC/passport, capacity and signature box in the PDF, without signing date or acknowledgement.
- This review PDF is not an SSM statutory return. Verify source registers, eBOS and all current details separately.

## DMS Documents company lookup (V1.6)

Inside the existing DMS web or Android app, choose **Documents → Companies → Annual Return** on the desired company card (or **Generate Annual Return** within the company folder). The **Annual Return** tab also searches the same authenticated Documents company list by name or registration number.

The selected company name and registration number populate **Company Details** through a guarded, same-origin iframe message, without a public query string or external server call. No other register or beneficial ownership information is transferred. Switching to a different company prompts before starting a clean form so previously entered statutory particulars cannot inadvertently carry across companies. Existing Supabase company/document records and Tencent EdgeOne signing requests are not changed. Export the editable JSON before changing tabs; finished PDFs can be manually uploaded to the correct DMS folder.


## SSM ROC business-code catalogue (31 October 2026)

- At build time, the app downloads SSM's official **MSIC 2008 Code – ROC** PDF and parses the **1,446 published ROC codes** into a separate bundled JSON. The list includes `29300e`, `29300i`, `29300u` and special `a/b` codes where SSM published them; suffixes are never guessed for unrelated five-digit MSIC codes.
- Search the combined DOSM/SSM catalogue, choose up to three entries, and retain the exact code and description in editable drafts and the PDF. The same catalogue is bundled into the web, main Android and standalone Annual Return Android builds.
- The build requires the `pdftotext` command (`poppler-utils`) and fails if the SSM catalogue extraction is incomplete, so a broken source cannot silently publish misleading codes.

## Removed retired shareholding and charge-count review fields (31 October 2026)

The Annual Return review no longer displays **Shares Held by Bodies Corporate** or **Number of Registered Charges**. Those fields are excluded from the default form, older imported or saved drafts, web/Android editing, and generated PDFs. This does not delete the underlying statutory registers or any of the individual Registered Charge records. The Combined Registers importer copies the charge particulars instead of reconstructing the removed charge-count field.

## Beneficial Ownership Criterion F (31 October 2026)

The Annual Return review supports all six SSM beneficial ownership criteria A–F. Criterion F is: "Has less than 20% of shares or voting shares but exercises significant control or influence over the company". The editor includes a **Criteria F** checkbox alongside its description, and generated PDFs print the selected **Criteria F — description** together in the right-hand cell of the Beneficial Ownership criteria table row. Existing saved and imported A–E selections remain unchanged; saved Criteria F selections are recognised on reopening. Source: SSM's BO criteria for private companies, https://crmsv.ssm4u.com.my/ssmkb/SSM4UExternal?wiki_id=10046 .
