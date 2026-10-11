"use strict";
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto');
for (const platform of [JSON.parse(fs.readFileSync(path.join(__dirname,'..','manifest.json'),'utf8')).browser_specific_settings?'firefox':'chrome']) {
  const root=path.join(__dirname,'..');
  const read=p=>fs.readFileSync(path.join(root,p),'utf8');
  const manifest=JSON.parse(read('manifest.json'));
  assert.equal(manifest.version,'2.0.1');
  assert.equal(manifest.manifest_version,3);
  assert.equal(manifest.options_ui.page,'dashboard.html');
  assert(manifest.optional_host_permissions.includes('https://*/*'));
  assert(!manifest.optional_host_permissions.some(x=>x.startsWith('http://')));
  if(platform==='firefox')assert.equal(manifest.browser_specific_settings.gecko.id,'kurl@drissner.me');
  else assert.equal(manifest.background.service_worker,'JS/worker.js');
  for(const p of ['dashboard.html','options.html','popup.html','bulk.html','logs.html']){
    const text=read(p);
    for(const match of text.matchAll(/<script[^>]+src="([^"]+)"/g))assert(fs.existsSync(path.join(root,match[1])),p+':'+match[1]);
  }
  for(const x of fs.readdirSync(path.join(root,'_locales'))){
    const locale=JSON.parse(read('_locales/'+x+'/messages.json'));
    assert(locale.extensionDescription.message && locale.menuQuickPage.message);
    assert(locale.popupCurrentPage.message && locale.optionsPrivacyNotice.message);
  }
  assert(read('JS/background.js').includes('signature, timestamp, hash: "sha256"'));
  assert(!read('JS/background.js').includes('password:'));
  assert(read('helper/kurl-helper/plugin.php').includes('Version: 1.1.7'));

  const events={};const calls=[];const stored={yourlsUrl:'https://sho.rt',apiSignature:'my-secret',autoCopy:true};
  const api={
    i18n:{getMessage:()=>'',getUILanguage:()=> 'en'},
    storage:{local:{get:async key=> typeof key==='string'?{[key]:stored[key]}:typeof key==='object'?{...key,...stored}:{...stored},set:async x=>Object.assign(stored,x),remove:async k=>delete stored[k]},onChanged:{addListener:()=>{}}},
    permissions:{contains:async()=>true},
    runtime:{onInstalled:{addListener:fn=>events.installed=fn},onStartup:{addListener:fn=>events.startup=fn},onMessage:{addListener:fn=>events.message=fn},getURL:p=>'moz-extension://test/'+p},
    menus:{remove:async()=>{},create:()=>{},onClicked:{addListener:fn=>events.click=fn}},
    tabs:{query:async()=>[{id:2,url:'https://www.example.com/post'}],get:async()=>({id:2,url:'https://www.example.com/post'})},
    notifications:{create:async()=>{}},action:{setBadgeText:async()=>{},setBadgeBackgroundColor:async()=>{}}
  };
  const context={browser:api,URL,URLSearchParams,AbortController,TextEncoder,TextDecoder,Uint8Array,ArrayBuffer,atob,
    navigator:{clipboard:{writeText:async()=>{}}},crypto:crypto.webcrypto,console,setTimeout,clearTimeout,Promise,
    fetch:async(url,opts)=>{
      const params=new URLSearchParams(opts.body); calls.push({url,params,opts});
      let result={status:'success',statusCode:200};
      const action=params.get('action');
      if(action==='db-stats')result={...result,total_links:3,total_clicks:18};
      if(action==='shorturl')result={...result,shorturl:'https://sho.rt/abc'};
      if(action==='expand')result={...result,longurl:'https://example.org/long',title:'demo'};
      if(action==='url-stats')result={...result,link:{shorturl:'https://sho.rt/abc',clicks:6,url:'https://example.org/long'}};
      if(action==='kurl_ping')result={...result,kurl_helper_version:'1.1.7',kurl_capabilities:['delete','find_by_url','regenerate']};
      if(action==='version')result={...result,version:'1.10.6'};
      if(action==='stats')result={...result,links:{}};
      return {ok:true,status:200,headers:{get:()=>null},body:null,text:async()=>JSON.stringify(result)};
    }
  };
  context.globalThis=context;vm.createContext(context);
  vm.runInContext(read('JS/helpers.js'),context);
  vm.runInContext(read('JS/background.js'),context);
  async function send(type,more={}){
    return await new Promise((resolve,reject)=>{
      const asyncFlag=events.message({type,...more}, {},resolve);
      assert.equal(asyncFlag,true,'onMessage must keep response port open');
      setTimeout(()=>reject(new Error('response timeout for '+type)),2000);
    });
  }
  assert.equal(vm.runInContext('unwrapRedirectUrl("https://www.google.de/url?url=https%3A%2F%2Fexample.org%2Fpost")',context),'https://example.org/post');
  assert.equal(vm.runInContext('unwrapRedirectUrl("https://duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.org%2Fddg")',context),'https://example.org/ddg');
  assert.equal(vm.runInContext('unwrapRedirectUrl("https://www.google.de/url?url=javascript%3Aalert(1)")',context),'https://www.google.de/url?url=javascript%3Aalert(1)');
  const bingTarget = "https://example.org/über?x=1";
  const bingEncoded = Buffer.from(bingTarget, "utf8").toString("base64url");
  assert.equal(vm.runInContext('unwrapRedirectUrl(' + JSON.stringify('https://www.bing.com/ck/a?u=a1'+bingEncoded) + ')',context),bingTarget);
  assert.equal(vm.runInContext('unwrapRedirectUrl("https://www.youtube.com/redirect?q=https%3A%2F%2Fexample.org%2Fyt")',context),'https://example.org/yt');
  assert.equal(vm.runInContext('unwrapRedirectUrl("https://www.google.evil.example/url?url=https%3A%2F%2Fexample.org%2Fphish")',context),
    'https://www.google.evil.example/url?url=https%3A%2F%2Fexample.org%2Fphish');
  assert.equal(vm.runInContext('unwrapRedirectUrl("https://www.bing.com/ck/a?u=a1amF2YXNjcmlwdDphbGVydCgxKQ")',context),
    'https://www.bing.com/ck/a?u=a1amF2YXNjcmlwdDphbGVydCgxKQ');
  assert.equal(vm.runInContext('unwrapRedirectUrl("https://www.google.com/url?q=https://example.org/gq&sa=D")',context),'https://example.org/gq');
  assert.equal(vm.runInContext('unwrapRedirectUrl("https://www.bing.com/ck/a?!&&p=x&u=a1aHR0cHM6Ly9leGFtcGxlLm9yZy9iaW5n&ntb=1")',context),'https://example.org/bing');
  (async()=>{
    const verified=await send('CHECK_CONNECTION');assert.equal(verified.total,3);
    const made=await send('SHORTEN_URL',{longUrl:'https://example.org/long'});
    assert.equal(made.shortUrl,'https://sho.rt/abc');
    assert(stored.kurlActivityLog.some(x=>x.action==='SHORTEN_URL'&&x.level==='info'),'shortening must be logged');
    const logged=stored.kurlActivityLog.length;
    await send('SHORTEN_URL',{longUrl:'https://example.org/long',bulk:true});
    assert.equal(stored.kurlActivityLog.length,logged,'bulk items are summarized by LOG_BULK, not logged one by one');
    assert(!JSON.stringify(stored.kurlActivityLog).includes('example.org'),'the activity log never stores URLs');
    const stats=await send('GET_STATS',{shortUrl:'https://sho.rt/abc'});
    assert.equal(stats.data.link.clicks,6);
    assert.equal(calls.find(x=>x.params.get('action')==='url-stats').params.get('shorturl'),'abc');
    const info=await send('GET_INFO');assert.equal(info.data.helperReady,true);
    const selected=await send('GET_SELECTED_URL');assert.equal(selected.url,'https://www.example.com/post');
    for(const call of calls){
      assert.equal(call.opts.redirect,'error');assert.equal(call.opts.credentials,'omit');
      assert.equal(call.params.get('hash'),'sha256');assert(call.params.get('timestamp'));
      assert.equal(call.params.get('signature').length,64);
      assert(!call.opts.body.toString().includes('my-secret'));
    }
    assert.equal(events.message({type:'KURL_OFFSCREEN_COPY'}, {},()=>{}),false);
    console.log(platform,'PASS: API authentication, stats keyword, helper, context and manifest');
  })().catch(e=>{console.error(platform,e);process.exitCode=1});
}
