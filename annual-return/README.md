# ZHENLI Annual Return PDF — Web and Android

Standalone local-only bilingual Annual Return **particulars review** PDF generator, based on the user's revised Google Apps Script template (9 October 2026) and latest structured example (13 October 2026). The **138 sections/headings/field rows** in `src/template.json` have their client values cleared and personal names removed. No client data, directors' NRICs, live database records or Google credentials are committed.

## October 2026 changes

- Share consideration selector: Cash, Otherwise than cash, Cash & otherwise than cash.
- Share class selector: Ordinary, Preference, Ordinary & Preference (company and member fields).
- Beneficial ownership type: Direct, Indirect, Direct & Indirect.
- Multiple BO criteria A-D can be selected with descriptions derived from SSM's revised beneficial ownership guideline. **For companies limited by shares, also review criteria E and F**; A-D alone are not an exhaustive BO eligibility assessment.
- Repeatable add-on entries for registered charges, directors, members, and beneficial owners. Additions and removals are preserved through editable JSON export/import and appear in the review PDF.
- Director's Confirmation and a distinct Signing Acknowledgement section. The checkbox records user-entered confirmation status only; it does **not** apply a digital signature.
- Web and Android now build from the same canonical `annual-return/` implementation. The legacy `annual-return-app/` source remains archived in GitHub for reference and does not overwrite the website.

Source of BO criteria: https://www.ssm.com.my/Pages/Legal_Framework/Document/Guideline%20BO%20(Revised)%202025%20fair.pdf , paragraph 27.

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
