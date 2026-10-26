'use strict';

const RELEASE_API = 'https://api.github.com/repos/zenithloh1016/zhenli-unified-dms/releases?per_page=25';
const RELEASE_BASE = 'https://github.com/zenithloh1016/zhenli-unified-dms/releases/';

function parseVersion(value) {
  const s=String(value||'').replace(/^desktop-v/i,'').replace(/^v/,'');
  const m=/^(\d+)\.(\d+)\.(\d+)$/.exec(s);
  return m?m.slice(1).map(Number):null;
}
function compareVersions(a,b) {
  const av=parseVersion(a),bv=parseVersion(b);
  if(!av||!bv)return 0;
  for(let i=0;i<3;i++)if(av[i]!==bv[i])return av[i]>bv[i]?1:-1;
  return 0;
}
function latestDesktopRelease(releases, currentVersion) {
  const eligible=(Array.isArray(releases)?releases:[])
    .filter(r=>!r.draft&&!r.prerelease&&/^desktop-v\d+\.\d+\.\d+$/.test(r.tag_name||''))
    .filter(r=>(r.assets||[]).some(a=>
      /^UNICOSEC-(?:Portable|Setup)-\d+\.\d+\.\d+-x64\.exe$/.test(a.name||'')));
  eligible.sort((a,b)=>compareVersions(b.tag_name,a.tag_name));
  return eligible.find(r=>compareVersions(r.tag_name,currentVersion)>0)||null;
}
function releasePage(tag) {
  if(!/^desktop-v\d+\.\d+\.\d+$/.test(String(tag||'')))return RELEASE_BASE;
  return RELEASE_BASE+'tag/'+tag;
}
module.exports={ RELEASE_API,RELEASE_BASE,parseVersion,compareVersions,latestDesktopRelease,releasePage };
