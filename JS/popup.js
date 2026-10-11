/* Browser popup: never accesses or modifies a web page without the user's action. */
(() => {
  "use strict";
  const H = globalThis.Helpers;
  const $ = id => document.getElementById(id);
  const t = (key, fallback, replacements) => browser.i18n.getMessage(key, replacements) || fallback;
  let currentPage = "";
  let busy = false;
  const status = (message, good = false) => {
    $("msg").textContent = message;
    $("msg").className = good ? "info ok" : "info";
  };
  async function send(type, more={}) {
    const response=await browser.runtime.sendMessage({type, ...more});
    if (!response?.ok) throw new Error(response?.reason || "YOURLS request failed");
    return response;
  }
  function i18n() {
    document.documentElement.lang=browser.i18n.getUILanguage().split("-")[0];
    document.documentElement.dir=browser.i18n.getMessage("@@bidi_dir") || "ltr";
    for(const node of document.querySelectorAll("[data-i18n-key]")) {
      const value=browser.i18n.getMessage(node.dataset.i18nKey);
      if(value) node.textContent=value;
    }
  }
  async function openPage(name) {
    await browser.tabs.create({url:browser.runtime.getURL(name)});
    window.close();
  }
  async function run(action) {
    if(busy) return;
    busy=true;
    $("btnShorten").disabled=true;
    try {await action();} catch(error){status(String(error?.message||error));}
    finally {busy=false;$("btnShorten").disabled=false;}
  }
  async function shorten() {
    const long=H.validHttpUrl($("longUrl").value);
    if(!long) throw new Error(t("popupErrorInvalidUrl","Enter a valid HTTP(S) URL."));
    status(t("popupStatusShortening","Shortening…"));
    const reply=await send("SHORTEN_URL",{longUrl:long,keyword:$("keyword").value.trim(),title:$("title").value.trim()});
    $("shortUrl").value=reply.shortUrl;
    $("statsInput").value=reply.shortUrl;
    $("qrcode-display").hidden=true;
    $("btnDownloadQr").hidden=true;
    const done=reply.already?t("popupInfoExisting","URL already shortened."):t("popupStatusCreated","Short URL created.");
    status(done,true);
    if((await H.getSettings()).autoCopy) {
      // Keep "already exists" visible; only append the copy confirmation.
      try {await navigator.clipboard.writeText(reply.shortUrl);status(done+" "+t("popupStatusCopied","Copied to clipboard."),true);}
      catch { /* Explicit Copy button remains available. */ }
    }
  }
  function drawQr(short, size=192) {
    const qr=qrcode(0,"H");qr.addData(new URL(short).href,"Byte");qr.make();
    const modules=qr.getModuleCount(),side=Math.max(size,modules+8),step=Math.max(1,Math.floor(side/(modules+8)));
    const canvas=document.createElement("canvas");canvas.width=side;canvas.height=side;
    const ctx=canvas.getContext("2d");ctx.fillStyle="#fff";ctx.fillRect(0,0,side,side);
    ctx.fillStyle="#000";const offset=Math.floor((side-modules*step)/2);
    for(let r=0;r<modules;r++) for(let c=0;c<modules;c++) if(qr.isDark(r,c))ctx.fillRect(offset+c*step,offset+r*step,step,step);
    return canvas;
  }
  $("open-settings").addEventListener("click",()=>openPage("options.html"));
  $("open-dashboard").addEventListener("click",()=>openPage("dashboard.html"));
  $("btnCurrentPage").addEventListener("click",()=>{$("longUrl").value=currentPage;$("longUrl").focus();});
  $("btnShorten").addEventListener("click",()=>run(shorten));
  $("btnCopy").addEventListener("click",()=>run(async()=>{
    const short=H.validHttpUrl($("shortUrl").value);
    if(!short)throw new Error(t("popupErrorNothingToCopy","Nothing to copy."));
    await navigator.clipboard.writeText(short);status(t("popupStatusCopied","Copied to clipboard."),true);
  }));
  $("btnStats").addEventListener("click",()=>run(async()=>{
    const value=$("statsInput").value.trim()||$("shortUrl").value;
    if(!value)throw new Error(t("popupErrorEnterUrlForStats","Enter a short URL or keyword."));
    const reply=await send("GET_STATS",{shortUrl:value});
    const item=reply.data?.link||reply.data?.url||{};
    status(t("popupStatusStatsResult",`Clicks: ${item.clicks??"?"}`,[String(item.shorturl||value),String(item.url||"?"),String(item.clicks??"?")]),true);
    $("json").textContent=JSON.stringify(reply.data,null,2);
  }));
  $("btnQrCode").addEventListener("click",()=>run(async()=>{
    const url=H.validHttpUrl($("shortUrl").value);
    if(!url)throw new Error(t("popupErrorNothingToAttach","Create a short URL first."));
    const panel=$("qrcode-display");panel.replaceChildren(drawQr(url));panel.hidden=false;$("btnDownloadQr").hidden=false;
  }));
  $("btnDownloadQr").addEventListener("click",()=>run(async()=>{
    const url=H.validHttpUrl($("shortUrl").value);if(!url)throw new Error("No short URL.");
    const a=document.createElement("a");a.href=drawQr(url,512).toDataURL("image/png");a.download="kurl-qrcode.png";
    document.body.appendChild(a);a.click();a.remove();
  }));
  async function init(){
    i18n();
    const settings=await H.getSettings();
    const active=await browser.tabs.query({active:true,currentWindow:true});
    currentPage=H.validHttpUrl(active?.[0]?.url)||"";
    if(currentPage)$("longUrl").value=currentPage;
    $("setup-message").hidden=!!(settings.yourlsUrl&&settings.apiSignature);
    $("main-content").hidden=!(settings.yourlsUrl&&settings.apiSignature);
    status(t("popupStatusReady","Ready."));
  }
  init().catch(error=>{$("setup-message").hidden=false;$("main-content").hidden=true;console.warn(error);});
})();
