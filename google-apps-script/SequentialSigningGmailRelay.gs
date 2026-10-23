/**
 * ZHENLI Unified DMS - Gmail Sequential Signing Invitation Relay
 *
 * Run under zhenlisecretary@gmail.com only.
 * Project Settings > Script Properties:
 *   ZHENLI_RELAY_SECRET = secret generated in DMS Gmail invitation settings.
 * Do NOT paste the secret into this source file or GitHub.
 *
 * Run authorizeSender() once and accept MailApp's send-mail permission.
 * Deploy > New deployment > Web app: Execute as Me, Access Anyone.
 * Calls without a valid HMAC are refused. No PDFs are sent to this script.
 */
const ZHENLI_SENDER='zhenlisecretary@gmail.com';
const ZHENLI_SIGNING_ORIGIN='https://zenithloh1016.github.io';
const ZHENLI_SIGNING_PATH='/zhenli-unified-dms/sign/';

function authorizeSender() {
  const identity=String(Session.getEffectiveUser().getEmail()||'').toLowerCase();
  if(identity!==ZHENLI_SENDER)throw new Error('Please authorize and deploy as '+ZHENLI_SENDER);
  const available=MailApp.getRemainingDailyQuota();
  if(available<1)throw new Error('No sending quota is currently available.');
  return 'Authorized '+identity+'; remaining recipients: '+available;
}
/**
 * Run manually in the Apps Script editor while logged into the Gmail sender.
 * This tests Google's MailApp authorization without sending any customer
 * documents or signed links. It must never be used as a public web endpoint.
 */
function testGmailDeliveryToSelf() {
  const identity=String(Session.getEffectiveUser().getEmail()||'').toLowerCase();
  if(identity!==ZHENLI_SENDER)
    throw new Error('Open and run this project as '+ZHENLI_SENDER);
  if(MailApp.getRemainingDailyQuota()<1)
    throw new Error('Gmail daily sending quota exhausted');
  MailApp.sendEmail({
    to:ZHENLI_SENDER,
    subject:'ZHENLI DMS | Gmail Relay Delivery Test',
    body:'This is a harmless email delivery test from your own ZHENLI Signing Gmail Relay. No signing links or documents are included.',
    name:'ZHENLI CONSULTANCY SERVICES SDN BHD'
  });
  console.log('Test email accepted by MailApp for '+ZHENLI_SENDER+'. Check Inbox / Spam to confirm actual delivery.');
}
function relayJson_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
function relayHex_(bytes) {
  return bytes.map(function(b){return ('0'+((b+256)%256).toString(16)).slice(-2);}).join('');
}
function relayEqual_(a,b) {
  if(a.length!==b.length)return false;
  let mismatch=0;
  for(let i=0;i<a.length;i++)mismatch|=a.charCodeAt(i)^b.charCodeAt(i);
  return mismatch===0;
}
function relayVerify_(data) {
  if(!data||typeof data!=='object')throw new Error('Invalid relay request.');
  const key=PropertiesService.getScriptProperties().getProperty('ZHENLI_RELAY_SECRET');
  if(!key||!/^[a-f0-9]{64}$/.test(key))throw new Error('Secret not configured.');
  const ts=Number(data.timestamp),nonce=String(data.nonce||'');
  if(!Number.isSafeInteger(ts)||Math.abs(Date.now()-ts)>300000)
    throw new Error('Relay timestamp expired.');
  if(!/^[a-f0-9]{32}$/.test(nonce))throw new Error('Invalid nonce.');
  if(!/^[a-f0-9]{64}$/.test(String(data.signature||'')))
    throw new Error('Invalid authentication.');
  if(!data.payload||Array.isArray(data.payload)||typeof data.payload!=='object')
    throw new Error('Invalid message body.');
  const expected=relayHex_(Utilities.computeHmacSha256Signature(
    ts+'.'+nonce+'.'+JSON.stringify(data.payload),key,Utilities.Charset.UTF_8));
  if(!relayEqual_(expected,data.signature))throw new Error('Relay authentication failed.');
  const identity=String(Session.getEffectiveUser().getEmail()||'').toLowerCase();
  if(identity!==ZHENLI_SENDER)throw new Error('Script is deployed under wrong account.');
  return {payload:data.payload,nonce:nonce};
}
function doGet() {
  return relayJson_({ok:false,error:'Signed POST request required'});
}
function doPost(event) {
  try {
    const text=String(event&&event.postData&&event.postData.contents||'');
    if(!text||text.length>12000)throw new Error('Invalid request length.');
    const request=JSON.parse(text),verified=relayVerify_(request);
    const payload=verified.payload;
    if(payload.kind==='ping')
      return relayJson_({ok:true,sender:ZHENLI_SENDER,
        quotaRemaining:MailApp.getRemainingDailyQuota()});
    if(payload.kind!=='send')throw new Error('Unknown relay action.');
    const to=String(payload.to||'').trim().toLowerCase();
    const name=String(payload.name||'').trim().slice(0,180);
    const company=String(payload.company||'').trim().slice(0,250);
    const subject=String(payload.subject||'').trim().slice(0,250);
    const documentTitle=String(payload.documentTitle||subject)
      .replace(/[\x00-\x1f\x7f]+/g,' ').replace(/\s+/g,' ').trim().slice(0,160);
    const note=String(payload.note||'').trim().slice(0,1000);
    const link=String(payload.link||'');
    if(!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(to)||!name||!company||!subject)
      throw new Error('Missing or invalid signer details.');
    // Apps Script V8 does not implement the browser URL class.
    const prefix=ZHENLI_SIGNING_ORIGIN+ZHENLI_SIGNING_PATH+'?token=';
    const token=link.startsWith(prefix)?link.slice(prefix.length):'';
    if(!/^[a-f0-9-]{36}\.[a-f0-9-]{36}\.[a-f0-9]{64}$/.test(token))
      throw new Error('Invalid ZHENLI signing link.');

    const lock=LockService.getScriptLock();
    if(!lock.tryLock(10000))throw new Error('Relay busy; retry.');
    try {
      const cache=CacheService.getScriptCache();
      const replayKey='relay_'+verified.nonce;
      if(cache.get(replayKey))throw new Error('Duplicate request refused.');
      cache.put(replayKey,'used',600);
      if(MailApp.getRemainingDailyQuota()<1)throw new Error('Daily email quota exhausted.');
      const body='Dear '+name+',\n\n'+
        'Please review and electronically sign the company document.\n\n'+
        'Company: '+company+'\nDocument: '+documentTitle+'\nSubject: '+subject+'\n\n'+
        'Secure individual signing link:\n'+link+'\n\n'+
        'This link is personal. Please do not forward it.\n\n'+
        (note?note+'\n\n':'')+
        'Thank you.\nZHENLI CONSULTANCY SERVICES SDN BHD';
      MailApp.sendEmail({
        to:to,
        subject:'ZHENLI | Signature required: '+documentTitle,
        body:body,
        name:'ZHENLI CONSULTANCY SERVICES SDN BHD'
      });
      return relayJson_({ok:true,accepted:true,sender:ZHENLI_SENDER});
    } finally {lock.releaseLock();}
  } catch(err) {
    const reason=String(err&&err.message||'Relay rejected request').slice(0,160);
    // Do not print request bodies or bearer links. View in Apps Script > Executions.
    console.error('ZHENLI Gmail Relay refusal: '+reason);
    return relayJson_({ok:false,error:reason});
  }
}
