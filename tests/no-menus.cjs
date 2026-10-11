"use strict";
// Firefox for Android has no menus API. The background script must still start
// and answer messages instead of throwing at browser.menus.onClicked.
const vm=require('node:vm'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.join(__dirname,'..');
let messageListener=null,installed=null;
const ev=()=>({addListener(){}});
const browser={
  i18n:{getMessage:()=>'',getUILanguage:()=>'en'},
  runtime:{onInstalled:{addListener:fn=>{installed=fn;}},onStartup:ev(),onMessage:{addListener:fn=>{messageListener=fn;}},
    getURL:p=>'moz-extension://id/'+p},
  storage:{local:{get:async()=>({}),set:async()=>{},remove:async()=>{}},onChanged:ev()},
  permissions:{contains:async()=>true},
  action:{setBadgeText:async()=>{},setBadgeBackgroundColor:async()=>{}},
  notifications:{create:async()=>'n'}
};
const context={browser,console,URL,URLSearchParams,TextEncoder,TextDecoder,Uint8Array,AbortController,
  setTimeout,clearTimeout,Promise,atob,crypto:require('node:crypto').webcrypto,navigator:{clipboard:{writeText:async()=>{}}}};
context.globalThis=context;vm.createContext(context);
for (const file of ['JS/polyfill.js','JS/helpers.js','JS/background.js'])
  vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),context,{filename:file});
assert.equal(typeof messageListener,'function','message listener must be registered');
(async()=>{
  installed({reason:'install'});
  await vm.runInContext('menuInit',context);
  const reply=await new Promise(resolve=>assert.equal(messageListener({type:'GET_LOG'},{},resolve),true));
  assert.equal(reply.ok,true);
  console.log('PASS: background starts without a menus API (Firefox for Android)');
})().catch(e=>{console.error(e);process.exitCode=1});
