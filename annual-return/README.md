# ZHENLI Annual Return PDF — Web and Android

Standalone local-only bilingual Annual Return **particulars review** PDF generator, based on the user's revised Google Apps Script template (9 October 2026) and latest structured example (13 October 2026). The **138 sections/headings/field rows** in `src/template.json` have their client values cleared and personal names removed. No client data, directors' NRICs, live database records or Google credentials are committed.

## Use

1. Open **https://zenithloh1016.github.io/zhenli-unified-dms/annual-return/** or install the separate **ZHENLI Annual Return** APK from the GitHub Action artifact.
2. Enter company details or **Import .gs / JSON**. The import parser recognises `const AR_SINGLE_COMPANY = {...};` and optional `const AR_SIGNATURE_DIRECTOR = {...};`; it never executes Apps Script code.
3. Review the bilingual particulars section by section. Blank source values remain blank in the editor and appear as *NOT PROVIDED / 未提供资料* in the PDF. Use Add field or Add section where necessary.
4. Enter the **one director** who will confirm the particulars; leave the date blank until signature. There is no director's resolution or members' resolution component.
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

## V1.4 clean fields and SSM MSIC 2008 (18 October 2026)

- The app starts directly from **Company Details**. There is no separate Company Profile.
- **Statutory Lodgement Deadline**, **Master Listing Internal Due Date**, **Register Last Updated**, and the related internal-vs-statutory deadline comparison are not shown or exported, even when importing older Apps Script / JSON drafts.
- The **Nature of Business / MSIC Code** field now lets users search and select up to **three** MSIC 2008 Ver.1 codes with English/Malay descriptions. It also accepts a manually verified SSM ROC code (5 digits with optional `e`, `i`, `u` suffix) because SSM ROC's special suffixes are not necessarily present in the national 5-digit dataset. Verify manual entries against the SSM list.
- Official SSM references: [BizCodEX](https://www.ssm.com.my/Pages/BizCodEX.aspx), [SSM ROC published code list](https://www.ssm.com.my/Pages/Publication/SSM%20MSIC%20Code/ROC/SSM%20MSIC%202008%20CODE%20-%20ROC.pdf).
- The catalogue is generated **at build/deployment time**, directly from the DOSM government's published [MSIC 2008 CSV](https://storage.dosm.gov.my/dictionaries/msic.csv), using `annual-return/scripts/build-msic.mjs`. The generated `public/msic-2008.json` is bundled into the deployed website/APK for offline searching. This is a versioned **official government-data snapshot**, not a live SSM API connection or automatic update of company details. DOSM data licence: CC BY 4.0, https://data.gov.my/data-catalogue/msic .
- In case the government CSV download or structure fails, the build stops instead of deploying a partial/fabricated code list.
- Selected codes appear in the bilingual PDF and editable JSON draft; company records and credentials remain local unless explicitly exported.

