"use strict";
const fs = require("node:fs"), path = require("node:path"), assert = require("node:assert/strict");
const root = path.join(__dirname,"..");
const html = fs.readFileSync(path.join(root,"dashboard.html"),"utf8");
const js = fs.readFileSync(path.join(root,"JS/dashboard.js"),"utf8");
const manifest = JSON.parse(fs.readFileSync(path.join(root,"manifest.json"),"utf8"));
assert.equal(manifest.version,"2.0.2");
assert.match(html, /<footer class="kurl-dashboard-footer"/);
assert.match(html, /id="kurl-dashboard-version"/);
assert.match(js,/browser\.runtime\.getManifest\(\)\.version/);
for(const [url,key] of [
 ["https://drissner.media/kontakt","footerContact"],
 ["https://www.paypal.com/paypalme/drissner","footerSupport"]
]) {
 const anchor=html.match(new RegExp('<a href="'+url+'"[^>]*>'));
 assert(anchor,`${key}: external link missing`);
 assert(anchor[0].includes('target="_blank"'));
 assert(anchor[0].includes('rel="noopener noreferrer"'));
 assert(anchor[0].includes('data-i18n-key="'+key+'"'));
}
for(const lang of fs.readdirSync(path.join(root,"_locales"))) {
 const data=JSON.parse(fs.readFileSync(path.join(root,"_locales",lang,"messages.json"),"utf8"));
 for(const key of ["footerContact","footerSupport"]) assert(data[key]?.message,lang+': '+key+' untranslated');
}
assert(!/paypalme|drissner\.media\/kontakt/i.test(fs.readFileSync(path.join(root,"JS/background.js"),"utf8")), 'footer should not trigger background requests');
console.log('PASS: runtime version and localized, click-only footer links');
