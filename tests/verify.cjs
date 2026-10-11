const fs=require('fs'),path=require('path'),assert=require('assert');
const r=path.join(__dirname,'..');const m=JSON.parse(fs.readFileSync(path.join(r,'manifest.json')));
assert.equal(m.manifest_version,3);assert.equal(m.version,'2.0.1');assert.equal(m.options_ui.page,'dashboard.html');
for (const p of ['popup.html','dashboard.html','options.html','bulk.html','logs.html']) {
 const s=fs.readFileSync(path.join(r,p),'utf8');for (const match of s.matchAll(/<script[^>]+src="([^"]+)"/g)) assert(fs.existsSync(path.join(r,match[1])),match[1]);
}
for (const l of fs.readdirSync(path.join(r,'_locales'))){const d=JSON.parse(fs.readFileSync(path.join(r,'_locales',l,'messages.json')));assert(d.menuQuickPage.message);}
for (const p of ['popup.html','dashboard.html','options.html','bulk.html','logs.html']) {
 const scripts=[...fs.readFileSync(path.join(r,p),'utf8').matchAll(/<script[^>]+src="([^"]+)"/g)].map(x=>x[1]);
 assert.equal(scripts[0],'JS/polyfill.js',p+' must load JS/polyfill.js before any script that uses browser.*');
}
for (const [size,file] of Object.entries(m.icons)) assert(fs.existsSync(path.join(r,file)),file);
assert(m.icons['128'],'stores display a 128x128 icon');
assert(!m.permissions.includes('tabs'),'activeTab is sufficient; tabs adds a browsing-history warning');
for (const l of fs.readdirSync(path.join(r,'_locales'))) {
 const d=JSON.parse(fs.readFileSync(path.join(r,'_locales',l,'messages.json')));
 for(const k of ["optionsShortcutTitle","optionsShortcutChange","popupBtnInsert","popupBtnAttachQr","popupStatusInserted","popupErrorNoCompose","commandShortenDescription","commandOpenReaderDescription","popupBtnShortenInsert","menuQuickInsert","optionsShortcutSentence","optionsBtnEditShortcuts","optionsShortcutUnassigned","popupErrorTargetChanged","popupErrorNoOriginal","contextInserted","insertPlainTextSelectUrl","insertCannotSafely"]) assert(!(k in d), l+': obsolete Thunderbird key '+k);
}
console.log('PASS: browser package and 10 locales');
