'use strict';

const HOME_URL = 'https://zenithloh1016.github.io/zhenli-unified-dms/';
const ALLOWED_ORIGIN = new URL(HOME_URL).origin;
const ALLOWED_PATH = new URL(HOME_URL).pathname;

function parse(value) {
  try { return new URL(value); } catch { return null; }
}

function isAppURL(value) {
  const url = parse(value);
  if (!url || url.protocol !== 'https:' || url.origin !== ALLOWED_ORIGIN ||
      url.username || url.password) return false;
  return url.pathname === ALLOWED_PATH.slice(0, -1) ||
    url.pathname.startsWith(ALLOWED_PATH);
}

function isAppBlobURL(value) {
  const url = parse(value);
  return !!url && url.protocol === 'blob:' && url.origin === ALLOWED_ORIGIN;
}

function isExternalURL(value) {
  const url = parse(value);
  if (!url || url.username || url.password) return false;
  return ['https:', 'http:', 'mailto:'].includes(url.protocol);
}

module.exports = { HOME_URL, isAppURL, isAppBlobURL, isExternalURL };
