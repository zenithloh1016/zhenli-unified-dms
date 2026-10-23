# Gmail invitation sender setup (ZHENLI Unified DMS)

This uses the account **zhenlisecretary@gmail.com** to automatically invite each signer in sequence through the existing Supabase signing service. The Tencent EdgeOne integration and already-signed documents stay unchanged.

1. Open **https://script.google.com/home/start** while signed in as **zhenlisecretary@gmail.com**. Create a new standalone Apps Script project and name it *ZHENLI Signing Gmail Relay*.
2. Open [the relay code](google-apps-script/SequentialSigningGmailRelay.gs) and copy its complete contents into the new Apps Script project's **Code.gs**. Save it.
3. Open [ZHENLI Unified DMS](https://zenithloh1016.github.io/zhenli-unified-dms/). Under **Signing → Supabase signing (independent) → Gmail invitation settings**, click **Generate new 64-character secret** and **Copy secret**.
4. In Apps Script, open **Project Settings (gear icon) → Script Properties → Add script property**. Set **Property** to **ZHENLI_RELAY_SECRET** and paste the key under **Value**. Save. Do not put the secret in Code.gs, GitHub, emails or chat.
5. Select function **authorizeSender** from the Apps Script editor's run dropdown. Select **Run** and authorize the requested send-mail permission using **zhenlisecretary@gmail.com**. The script checks that the executing account matches.
6. Select **Deploy → New deployment → Web app**. Set **Execute as: Me** and **Who has access: Anyone** (including callers not logged into Google). Choose **Deploy**. Copy the URL ending in **/exec**. Google may ask for another authorization.
7. Return to DMS Gmail invitation settings. Paste both the Apps Script **/exec** URL and the same secret, then select **Test & connect Gmail relay**. The Supabase Edge Function verifies the remote script with an HMAC-signed test request before storing the connection in a private service-role-only table.
8. For the pending **ACE EZDRIVE SDN. BHD.** signing request, click **Resend invitation** to the current signer after connecting. Future signers are invited automatically when the preceding signer signs.

**If the authorization fails:** The Apps Script project must be created and deployed by the sender account, with access **Anyone** and execution **Me**. Other Google account types or organizational policies may restrict this option. Ensure the Script Property value exactly matches the 64-character key entered in DMS. If you later edit Apps Script code, publish a *new version* of the web app under Deploy → Manage deployments.

**Security:** The public script URL is not a public mail API. It requires an HMAC-SHA256 signature, a timestamp no older than five minutes, a random nonce and a matching ZHENLI DMS signing URL. Relay secrets do not appear in frontend source, browser storage, email messages or the GitHub repository. The script never receives uploaded PDFs or signature images.

**Note:** Gmail MailApp acceptance does not guarantee delivery into recipients' Inbox; spam filters and Google's daily email quotas still apply. Source: [Google Web apps deployment](https://developers.google.com/apps-script/guides/web), [Script Properties](https://developers.google.com/apps-script/guides/properties), and [MailApp](https://developers.google.com/apps-script/reference/mail/mail-app).
## Automatic email subject follows the uploaded PDF title

For new invitations sent by the Gmail relay, the subject is automatically
**ZHENLI | Signature required: [uploaded PDF document title]**.
The title is derived from the **first uploaded PDF filename**, with the trailing
`.pdf` removed. When more than one PDF is attached, the subject indicates the
number of additional documents, e.g. **ZHENLI | Signature required: Directors Written Resolution (+2 more documents)**.
If the PDF filename is unavailable, the existing signing-request subject is used.
This applies to the first invitation, sequential invitations and **Resend invitation**.

**If you previously deployed the Google Apps Script relay**, replace the existing
`Code.gs` with the latest [SequentialSigningGmailRelay.gs](google-apps-script/SequentialSigningGmailRelay.gs),
then open **Deploy → Manage deployments → Edit → Version: New version → Deploy**.
Updating GitHub alone does not update a separately deployed Apps Script web app.
Existing signed PDFs and signing request records remain unchanged.

## Troubleshooting: invitation email is not accepted

1. Check that the PDF actually belongs to the company before resending.
2. Replace the **entire** Apps Script `Code.gs` with the latest [relay source](google-apps-script/SequentialSigningGmailRelay.gs), then Save. Do not paste individual snippets that may omit required constants.
3. Select **testGmailDeliveryToSelf**, click **Run**, and complete the Google authorization prompt if asked. This sends only a harmless test message **to zhenlisecretary@gmail.com** (no customer PDF or signing link). If it fails, inspect the execution error under Apps Script **Executions**; this isolates sender permissions or quota.
4. If the harmless test succeeds, go to **Deploy → Manage deployments → Edit (pencil) → Version: New version → Deploy**. Updating the editor without this step leaves the DMS calling the old script version. Keep the existing /exec URL and existing Script Property secret.
5. Back in DMS, choose the relevant **pending** signing request and select **Resend invitation** only after you have checked its attached document. The DMS response reports the exact relay error when Gmail refuses. In Apps Script **Executions**, the latest `doPost` run will also show a **ZHENLI Gmail Relay refusal** message without printing confidential signing links.
6. If Google reports that MailApp accepted the message but the recipient cannot find it, check the recipient's Spam/Junk folder and the sender account's Sent Mail. MailApp acceptance cannot guarantee recipient Inbox delivery.

The `authorizeSender` function only checks the effective account and available quota; it does **not** prove a message can be sent. The `testGmailDeliveryToSelf` function exercises the real MailApp sending permission.
