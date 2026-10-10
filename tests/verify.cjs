const fs=require('fs'),path=require('path'),assert=require('assert');
const r=path.join(__dirname,'..');const m=JSON.parse(fs.readFileSync(path.join(r,'manifest.json')));
assert.equal(m.manifest_version,3);assert.equal(m.version,'2.0.0');assert.equal(m.options_ui.page,'dashboard.html');
for (const p of ['popup.html','dashboard.html','options.html','bulk.html','logs.html']) {
 const s=fs.readFileSync(path.join(r,p),'utf8');for (const match of s.matchAll(/<script[^>]+src="([^"]+)"/g)) assert(fs.existsSync(path.join(r,match[1])),match[1]);
}
for (const l of fs.readdirSync(path.join(r,'_locales'))){const d=JSON.parse(fs.readFileSync(path.join(r,'_locales',l,'messages.json')));assert(d.menuQuickPage.message);}
console.log('PASS: browser package and 10 locales');
