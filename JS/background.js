/* kURL browser background: shared hardened YOURLS API service. */
"use strict";
const H = globalThis.Helpers;
const i18n = (key, fallback) => browser.i18n.getMessage(key) || fallback;
const i18nArg = (key, value, fallback) =>
  browser.i18n.getMessage(key, [String(value)]) || fallback.replace("$1", String(value));
const MAX_BODY = 1048576;
const TIMEOUT = 15000;
const HELPER_VERSION = "1.1.6";
const HELPER_CACHE_MS = 5 * 60 * 1000;
let helperCache = null;
function helperVersionAtLeast(found, minimum = HELPER_VERSION) {
  if (!/^\d+(\.\d+){1,2}$/.test(String(found))) return false;
  const a = String(found).split(".").map(Number);
  const b = minimum.split(".").map(Number);
  for (let i=0;i<3;i++) { if ((a[i]||0)!==(b[i]||0)) return (a[i]||0)>(b[i]||0); }
  return true;
}
// YOURLS API does not provide a browser login. A signed read-only db-stats
// request is our connection/token verification. Classify failures by the
// structured API error fields first, not just an English server message.
function apiFailureKind(json, httpStatus) {
  const value = typeof json?.message === "string" ? json.message.trim() : "";
  const code = Number(json?.errorCode ?? json?.statusCode ?? httpStatus);
  const explicitAuth = /^(?:please log in[.!]?|authentication required[.!]?|invalid (?:api )?signature[.!]?|invalid username or password[.!]?)$/i.test(value);
  if (explicitAuth) return "AUTH_REJECTED";
  if (code === 401 || code === 403) return "ACCESS_DENIED";
  return "OTHER";
}
function apiError(json, code) {
  const kind = apiFailureKind(json, code);
  if (kind === "AUTH_REJECTED") {
    return i18n("apiAuthRejected", "YOURLS rejected API authentication. After an update the signature token may have changed. Sign in to the YOURLS admin page in your browser, open Admin → Tools, copy your current API signature into kURL Settings, then select Test connection & save. kURL does not need your YOURLS username or password. If it still fails, check your computer/server clocks and server access rules.");
  }
  if (kind === "ACCESS_DENIED") {
    return i18n("apiAccessDenied", "The server refused API access (HTTP 401/403). Check the signature token in YOURLS Admin → Tools, then test the connection again. If the token is current, check server security rules, API access and system clocks; kURL cannot sign in through the browser for you.");
  }
  const value = typeof json?.message === "string" ? json.message.trim() : "";
  return value ? value.slice(0, 300) : `YOURLS request failed (HTTP ${code}).`;
}
function apiFailure(json, code) {
  const e = new Error(apiError(json, code));
  const kind = apiFailureKind(json, code);
  if (kind !== "OTHER") e.code = kind;
  return e;
}
function extractFirstUrl(raw) {
  let found = String(raw || "").match(/https?:\/\/[^\s<>"'«»“”]+/i)?.[0] || "";
  // Closing brackets are meaningful inside Wikipedia-style URLs and query values.
  // Remove only unmatched trailing brackets (and ordinary prose punctuation).
  const pairs = {")":"(", "]":"[", "}":"{"};
  while (found) {
    const last = found.slice(-1);
    if (/[.,;:!?»”]/u.test(last)) {found = found.slice(0,-1);continue;}
    if (pairs[last]) {
      const count = char => [...found].filter(c => c === char).length;
      if (count(last) > count(pairs[last])) {found = found.slice(0,-1);continue;}
    }
    break;
  }
  return H.validHttpUrl(found);
}

async function getHelperInfo(force = false) {
  const config = await H.getSettings();
  const key = config.yourlsUrl + ":" + config.apiSignature;
  if (!force && helperCache?.key === key && Date.now() - helperCache.time < HELPER_CACHE_MS)
    return helperCache.info;
  let ping;
  try { ping = success(await request("kurl_ping")); }
  catch { ping = {}; }
  const caps = Array.isArray(ping.kurl_capabilities)
    ? ping.kurl_capabilities.filter(x => typeof x === "string") : [];
  const version = String(ping.kurl_helper_version || "");
  const info = {version, capabilities: caps,
    ready: helperVersionAtLeast(version) &&
      ["delete", "find_by_url", "regenerate"].every(x => caps.includes(x))};
  helperCache = ping.kurl_helper_version ? {key,time: Date.now(),info} : null;
  return info;
}


// Never insert transient status nodes in a Thunderbird compose editor: they
// can be serialized into an outgoing message or an autosaved draft.
const badgeTimers = new Map();
async function signalToolbar(kind, tabId) {
  if (!Number.isInteger(tabId) || tabId < 0) return;
  const previous = badgeTimers.get(tabId);
  if (previous) clearTimeout(previous);
  const value = kind === "error" ? "!" : "✓";
  const color = kind === "error" ? "#b91c1c" : "#15803d";
  const actions = [browser.action, browser.messageDisplayAction, browser.composeAction];
  for (const api of actions) {
    try {
      if (api?.setBadgeText) await api.setBadgeText({text: value, tabId});
      if (api?.setBadgeBackgroundColor) await api.setBadgeBackgroundColor({color, tabId});
    } catch { /* This toolbar API may not exist in the current Thunderbird view. */ }
  }
  const timeout = setTimeout(() => {
    if (badgeTimers.get(tabId) !== timeout) return;
    badgeTimers.delete(tabId);
    for (const api of actions) {
      try { void api?.setBadgeText?.({text: "", tabId})?.catch?.(() => {}); } catch {}
    }
  }, 3500);
  badgeTimers.set(tabId, timeout);
}
async function contextFeedback(tab, message, kind = "success") {
  // Suppress only optional success messages. Failures must remain visible.
  if (kind === "success") {
    const settings = await H.getSettings();
    if (!settings.showCopyNotifications) return;
  }
  // OS notifications and a tab-scoped badge do not modify the email body.
  await Promise.allSettled([notify(message), signalToolbar(kind, tab?.id)]);
}

function notify(message) {
  return browser.notifications.create({
    type: "basic", title: "kURL", message: String(message),
    iconUrl: browser.runtime.getURL("images/kurl-icon-48.png")
  }).catch(error => console.warn("kURL notification unavailable:", error?.message || error));
}

function requireTarget(value) {
  const url = H.validHttpUrl(value);
  if (!url) throw new Error(i18n("popupErrorInvalidUrl", "Enter a valid HTTP(S) URL."));
  return url;
}

async function request(action, options = {}, override = null) {
  const settings = override || await H.getSettings();
  const base = H.sanitizeBaseUrl(settings.yourlsUrl);
  const token = String(settings.apiSignature || "").trim();
  if (!base || !token) throw new Error(i18n("errorNoSettings", "Configure an HTTPS YOURLS connection first."));
  if (!base.startsWith("https://")) throw new Error("An HTTPS YOURLS server is required to protect your API token.");
  const allowed = await browser.permissions.contains({
    origins: [new URL(base).origin + "/*"]
  });
  if (!allowed) throw new Error("YOURLS host permission is not granted. Open Settings.");
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT);
  try {
    const timestamp = String(Math.floor(Date.now() / 1000));
    const bytes = new TextEncoder().encode(timestamp + token);
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    const signature = Array.from(new Uint8Array(digest), x => x.toString(16).padStart(2, "0")).join("");
    const body = H.toFormData({ ...options, action, format: "json",
      signature, timestamp, hash: "sha256" });
    const response = await fetch(base + "/yourls-api.php", {
      method: "POST",
      redirect: "error",
      credentials: "omit",
      cache: "no-store",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
        "Accept": "application/json"
      },
      body, signal: controller.signal
    });
    if (Number(response.headers.get("content-length")) > MAX_BODY) {
      throw new Error("YOURLS response is too large.");
    }
    const reader = response.body?.getReader();
    let text = "";
    if (reader) {
      const chunks = [];
      let length = 0;
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        length += part.value.byteLength;
        if (length > MAX_BODY) {
          await reader.cancel();
          throw new Error("YOURLS response is too large.");
        }
        chunks.push(part.value);
      }
      const joined = new Uint8Array(length);
      let offset = 0;
      for (const chunk of chunks) { joined.set(chunk, offset); offset += chunk.length; }
      text = new TextDecoder().decode(joined);
    } else {
      text = await response.text();
      if (text.length > MAX_BODY) throw new Error("YOURLS response is too large.");
    }
    const json = H.parseMaybeJson(text);
    if (!json) {
      if (response.status === 401 || response.status === 403) throw apiFailure(null, response.status);
      throw new Error(browser.i18n.getMessage("apiInvalidResponse", [String(response.status)]) ||
        `YOURLS did not return a valid API response (HTTP ${response.status}). Check the server URL, HTTPS and any proxy or login redirect.`);
    }
    return { httpOK: response.ok, status: response.status, json };
  } catch (error) {
    if (error.name === "AbortError") throw new Error("YOURLS request timed out (15 s).");
    if (error instanceof TypeError) throw new Error("Connection failed. Check HTTPS, the YOURLS hostname, certificate and redirects (redirects are not allowed).");
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

function success(result) {
  const j = result.json;
  if (!result.httpOK || j?.status === "fail" || j?.status === "error" ||
      j?.statusCode === "error" || Number(j?.statusCode) >= 400 ||
      Number(j?.errorCode) >= 400) {
    throw apiFailure(j, result.status);
  }
  return j;
}

async function checkConnection(override) {
  const r = await request("db-stats", {}, override);
  const j = success(r);
  return { ok: true, total: Number(j.total_links ?? j["db-stats"]?.total_links ?? 0) || 0 };
}

async function shorten(long, keyword = "", title = "") {
  const url = requireTarget(long);
  const rawKeyword = String(keyword || "").trim();
  const cleanKeyword = rawKeyword ? H.validKeyword(rawKeyword) : "";
  if (rawKeyword && !cleanKeyword) throw new Error("Invalid custom keyword; letters, digits, - and _ are accepted, but YOURLS may adjust unsupported characters.");
  const { yourlsUrl } = await H.getSettings();
  const base = H.sanitizeBaseUrl(yourlsUrl);
  const r = await request("shorturl", {
    url, ...(cleanKeyword ? { keyword: cleanKeyword } : {}),
    ...(title ? { title: String(title).slice(0, 300) } : {})
  });
  const short = H.extractShort(r.json, base);
  // error:url means the long URL exists; a keyword collision is a real failure.
  const existing = r.json?.code === "error:url";
  if (short && (existing || (r.httpOK && r.json?.status !== "fail" &&
      r.json?.status !== "error" && Number(r.json?.statusCode || 200) < 400))) {
    return { ok: true, shortUrl: short, already: existing,
      keywordAdjusted: !existing && !!cleanKeyword && H.extractKeyword(base, short) !== cleanKeyword };
  }
  throw apiFailure(r.json, r.status);
}

async function expandShort(value) {
  const settings = await H.getSettings();
  const base = H.sanitizeBaseUrl(settings.yourlsUrl);
  const keyword = H.extractKeyword(base, value);
  if (!keyword) throw new Error(i18n("lookupInvalid", "Enter a short URL from your YOURLS server."));
  // Use the keyword for YOURLS installations whose public HTTPS endpoint sits
  // behind a reverse proxy with an internal HTTP base URL.
  const result = success(await request("expand", {shorturl:keyword}));
  const target = H.validHttpUrl(result.longurl);
  if (!target) throw new Error(i18n("lookupNotFound", "Short URL not found."));
  return {shortUrl:base + "/" + keyword, target,
    title:typeof result.title === "string" ? result.title : ""};
}

async function stats(value) {
  const settings = await H.getSettings();
  const base = H.sanitizeBaseUrl(settings.yourlsUrl);
  const kw = H.extractKeyword(base, value);
  if (!kw) throw new Error("Enter a keyword or a short URL from your YOURLS server.");
  // YOURLS url-stats compares full URLs with YOURLS_SITE. A keyword works
  // for public HTTPS origins proxied to an internal HTTP YOURLS_SITE.
  const r = await request("url-stats", { shorturl: kw });
  return success(r);
}

async function listLinks(filter, limit, start = 0) {
  const safeFilter = filter === "top" ? "top" : "last";
  const safeLimit = Math.max(1, Math.min(50, Number(limit) || 10));
  const safeStart = Math.max(0, Math.min(1000000, Number(start) || 0));
  const r = await request("stats", {
    filter: safeFilter, limit: safeLimit, start: safeStart
  });
  return success(r);
}

async function info(forceHelper = false) {
  const config = await H.getSettings();
  // These are independent read-only requests. Run them concurrently.
  const [dbResult, versionResult, pingResult] = await Promise.allSettled([
    request("db-stats").then(success),
    request("version").then(success),
    getHelperInfo(forceHelper)
  ]);
  if (dbResult.status !== "fulfilled") throw dbResult.reason;
  const db = dbResult.value;
  const version = versionResult.status === "fulfilled" ? versionResult.value : {};
  const ping = pingResult.status === "fulfilled" ? pingResult.value : {};
  const helperVersion = String(ping.version || "");
  const capabilities = ping.capabilities || [];
  return {
    base: H.sanitizeBaseUrl(config.yourlsUrl),
    yourlsVersion: String(version.version || version.version_number || ""),
    helperVersion,
    helperReady: helperVersionAtLeast(helperVersion) &&
      ["delete", "find_by_url", "regenerate"].every(cap => capabilities.includes(cap)),
    totalLinks: Number(db.total_links ?? db["db-stats"]?.total_links ?? 0) || 0,
    totalClicks: Number(db.total_clicks ?? db["db-stats"]?.total_clicks ?? 0) || 0
  };
}

/* WordPress kURL feature parity: safe reverse lookup and non-destructive edits. */
async function requireHelper(capability) {
  const info = await getHelperInfo();
  if (!info.ready || !info.capabilities.includes(capability))
    throw new Error("This action requires kURL Helper 1.1.6 or newer with the advertised capabilities.");
}

function isHelperNotFound(r) {
  const data = r.json || {};
  return Number(data.statusCode) === 404;
}

async function lookupUrl(rawUrl, preferredShort = "") {
  const url = requireTarget(rawUrl);
  await requireHelper("find_by_url");
  const base = H.sanitizeBaseUrl((await H.getSettings()).yourlsUrl);
  const preferredKw = preferredShort ? H.extractKeyword(base, preferredShort) : "";
  if (preferredShort && !preferredKw) throw new Error("Invalid preferred short URL.");
  const r = await request("kurl_find_by_url", {
    url, ...(preferredKw ? { preferred_shorturl: base + "/" + preferredKw } : {})
  });
  if (isHelperNotFound(r)) return { found: false, shortUrl: "", keyword: "", target: url };
  const json = success(r);
  const shortUrl = H.extractShort(json, base);
  if (!shortUrl) throw new Error("Lookup returned no usable short URL.");
  return { found: true, shortUrl, keyword: H.extractKeyword(base, shortUrl),
    target: H.validHttpUrl(json.longurl || url) || url,
    title: typeof json.title === "string" ? json.title : "" };
}


async function regenerateUrl(rawUrl, existing, rawKeyword = "", title = "") {
  const target = requireTarget(rawUrl);
  const base = H.sanitizeBaseUrl((await H.getSettings()).yourlsUrl);
  const oldKeyword = H.extractKeyword(base, existing);
  if (!oldKeyword) throw new Error("Choose an existing short URL on your YOURLS server.");
  const keyword = String(rawKeyword || "").trim();
  if (keyword && !H.validKeyword(keyword)) {
    throw new Error("Invalid keyword; letters, digits, hyphens and underscores are permitted by this add-on.");
  }
  await requireHelper("regenerate");
  // kurl_regenerate calls yourls_edit_link, preserving the existing row/click history.
  const r = await request("kurl_regenerate", {
    url: target, shorturl: base + "/" + oldKeyword,
    ...(keyword ? { keyword } : {}),
    ...(title ? { title: String(title).slice(0, 300) } : {})
  });
  const data = success(r);
  const result = H.extractShort(data, base);
  if (!result) throw new Error("YOURLS did not return the edited short URL.");
  return { ok: true, shortUrl: result, keyword: H.extractKeyword(base, result) };
}

/* Seven-day, bounded, local operation history. Never store URL targets or tokens. */
const LOG_WINDOW = 7 * 24 * 60 * 60 * 1000;
const LOG_MAX = 100;
let logQueue = Promise.resolve();
function writeLog(action, level = "info") {
  logQueue = logQueue.catch(() => {}).then(async () => {
    const { kurlActivityLog } = await browser.storage.local.get("kurlActivityLog");
    const now = Date.now();
    const current = Array.isArray(kurlActivityLog) ? kurlActivityLog : [];
    const entries = current.filter(row => row && Number.isFinite(row.time) &&
      row.time > now - LOG_WINDOW && row.time <= now && typeof row.action === "string");
    entries.push({ time: now, action: String(action).slice(0, 64),
      level: level === "error" ? "error" : "info" });
    await browser.storage.local.set({ kurlActivityLog: entries.slice(-LOG_MAX) });
  });
  return logQueue.catch(() => {});
}
async function listLog() {
  await logQueue.catch(() => {});
  const { kurlActivityLog } = await browser.storage.local.get("kurlActivityLog");
  const now = Date.now();
  const entries = (Array.isArray(kurlActivityLog) ? kurlActivityLog : [])
    .filter(row => row && row.time > now - LOG_WINDOW && row.time <= now)
    .slice(-LOG_MAX).reverse();
  return entries.map(row => ({ time: row.time,
    action: String(row.action).slice(0, 64),
    level: row.level === "error" ? "error" : "info" }));
}
async function clearLog() {
  await logQueue.catch(() => {});
  await browser.storage.local.remove("kurlActivityLog");
  return { ok: true };
}

async function deleteLink(input) {
  const config = await H.getSettings();
  const base = H.sanitizeBaseUrl(config.yourlsUrl);
  const kw = H.extractKeyword(base, input);
  if (!kw) throw new Error("This is not a short URL from your configured YOURLS server.");
  await requireHelper("delete");
  const r = await request("kurl_delete", { shorturl: base + "/" + kw });
  if (!isHelperNotFound(r)) success(r);
  return { ok: true, alreadyMissing: isHelperNotFound(r) };
}


async function dispatch(message) {
  switch(message.type) {
    case "CHECK_CONNECTION": return await checkConnection(message.settings||null);
    case "SHORTEN_URL": return await shorten(message.longUrl,message.keyword,message.title);
    case "GET_STATS": return {ok:true,data:await stats(message.shortUrl)};
    case "EXPAND_URL": return {ok:true,data:await expandShort(message.shortUrl)};
    case "GET_INFO": return {ok:true,data:await info(!!message.forceHelper)};
    case "GET_RECENT_LINKS": return {ok:true,data:await listLinks("last",message.limit,message.start)};
    case "GET_TOP_LINKS": return {ok:true,data:await listLinks("top",message.limit)};
    case "LOOKUP_URL": return {ok:true,data:await lookupUrl(message.longUrl,message.preferredShort)};
    case "DELETE_SHORTURL": return await deleteLink(message.shortUrl);
    case "UPDATE_URL": return await regenerateUrl(message.longUrl,message.shortUrl,message.keyword||H.extractKeyword(H.sanitizeBaseUrl((await H.getSettings()).yourlsUrl),message.shortUrl),message.title);
    case "REGENERATE_URL": return await regenerateUrl(message.longUrl,message.shortUrl,message.keyword,message.title);
    case "GET_LOG": return {ok:true,data:await listLog()};
    case "CLEAR_LOG": return await clearLog();
    case "GET_SELECTED_URL": return {ok:true,url:await activeUrl(message.tabId)};
    case "LOG_BULK": await writeLog("BULK: "+Math.min(250,Math.max(0,Number(message.total)||0))+" URLs",message.failures?"error":"info");return {ok:true};
    default:return {ok:false,reason:"Unsupported request."};
  }
}
// Use the callback protocol supported by Chrome MV3 and Firefox. Do not accidentally
// answer an offscreen-document clipboard message in the service worker.
browser.runtime.onMessage.addListener((message,sender,sendResponse)=>{
  if(!message || message.type==="KURL_OFFSCREEN_COPY")return false;
  Promise.resolve().then(()=>dispatch(message)).then(
    result=>sendResponse(result), error=>sendResponse({ok:false,reason:String(error?.message||error),
      ...(error?.code?{errorCode:error.code}:{})})
  );
  return true;
});

/* Browser-native context menu and active-page functions. */
function validPageUrl(value) {return H.validHttpUrl(value);}
async function activeUrl(tabId) {
  if (Number.isInteger(tabId)) {
    const tab=await browser.tabs.get(tabId);return validPageUrl(tab?.url) || "";
  }
  const tabs=await browser.tabs.query({active:true,currentWindow:true});
  return validPageUrl(tabs?.[0]?.url) || "";
}
const MENU_COPY="kurl-browser-copy", MENU_PAGE="kurl-browser-page";
let menuInit=Promise.resolve();
function ensureMenus() {
  menuInit=menuInit.catch(()=>{}).then(async()=>{
    const entries=[
      {id:MENU_COPY,title:i18n("menuQuickCopy","kURL: Shorten and copy"),contexts:["selection","link"]},
      {id:MENU_PAGE,title:i18n("menuQuickPage","kURL: Shorten current page and copy"),contexts:["page"]}
    ];
    for(const item of entries){
      try {await browser.menus.remove(item.id);}catch{}
      await browser.menus.create(item);
    }
  });return menuInit;
}
browser.runtime.onInstalled.addListener(()=>{void ensureMenus();});
browser.runtime.onStartup?.addListener(()=>{void ensureMenus();});
const badges=new Map();
async function feedback(tab,message,error=false) {
  if(!error && !(await H.getSettings()).showCopyNotifications)return;
  try {await browser.notifications.create({type:"basic",title:"kURL",message,
    iconUrl:browser.runtime.getURL("images/kurl-icon-48.png")});}catch{}
  const id=tab?.id;if(!Number.isInteger(id))return;
  const timer=badges.get(id);if(timer)clearTimeout(timer);
  try {await browser.action.setBadgeText({tabId:id,text:error?"!":"✓"});
    await browser.action.setBadgeBackgroundColor({tabId:id,color:error?"#b91c1c":"#15803d"});}catch{}
  const next=setTimeout(()=>{badges.delete(id);void browser.action.setBadgeText({tabId:id,text:""}).catch(()=>{});},3300);
  badges.set(id,next);
}
async function copyShortUrl(short) {
  if(typeof navigator!=="undefined" && navigator.clipboard?.writeText){
    await navigator.clipboard.writeText(short);return;
  }
  if(typeof chrome==="undefined" || !chrome.offscreen)
    throw new Error("Clipboard unavailable. Open the kURL popup to copy the link.");
  if(!(await chrome.offscreen.hasDocument())){
    await chrome.offscreen.createDocument({url:"offscreen.html",reasons:["CLIPBOARD"],
      justification:"Copy user-requested YOURLS short links to the clipboard"});
  }
  const copied=await browser.runtime.sendMessage({type:"KURL_OFFSCREEN_COPY",text:short});
  if(!copied?.ok)throw new Error(copied?.reason||"Clipboard access denied");
}
browser.menus.onClicked.addListener(async (info,tab)=>{
  if(info.menuItemId!==MENU_COPY && info.menuItemId!==MENU_PAGE)return;
  const raw=info.menuItemId===MENU_PAGE ? (info.pageUrl||tab?.url) :
    (info.linkUrl||extractFirstUrl(info.selectionText)||validPageUrl(info.selectionText));
  const url=validPageUrl(raw);
  if(!url)return feedback(tab,i18n("contextSelectUrl","Select a complete HTTP(S) URL."),true);
  try {
    const result=await shorten(url);
    await copyShortUrl(result.shortUrl);
    await writeLog("RIGHT_CLICK_COPY");
    await feedback(tab,i18nArg("contextCopied",result.shortUrl,"Copied to clipboard: $1"));
  }catch(error){
    await writeLog("RIGHT_CLICK_FAILED","error");
    await feedback(tab,String(error?.message||"Shortening failed"),true);
  }
});
