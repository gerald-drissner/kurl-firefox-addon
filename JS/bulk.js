/* Pasted-URL bulk creator. Never touches WordPress posts or the address book. */
"use strict";
const H = window.Helpers;
const $ = id => document.getElementById(id);
const t = (key, fallback) => browser.i18n.getMessage(key) || fallback;
let running = false;
let stopRequested = false;
let results = [];
const MAX_ROWS = 250;
function status(value) { $("bulk-status").textContent = value; }
function localize() {
  document.documentElement.lang = browser.i18n.getUILanguage().split("-")[0];
  document.documentElement.dir = browser.i18n.getMessage("@@bidi_dir") || "ltr";
  document.querySelectorAll("[data-i18n-key]").forEach(el => {
    const message = browser.i18n.getMessage(el.dataset.i18nKey);
    if (message) el.textContent = message;
  });
}
function parseRows() {
  const raw = $("bulk-input").value.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
  if (raw.length > MAX_ROWS) throw new Error("Maximum " + MAX_ROWS + " URL lines per run.");
  const seen = new Set();
  const rows = [];
  for (const [i, entry] of raw.entries()) {
    const url = H.validHttpUrl(entry);
    if (url && seen.has(url)) continue;
    if (url) seen.add(url);
    rows.push({longUrl: url || entry.slice(0, 500), invalid: !url, line: i + 1});
  }
  return rows;
}

function render() {
  const container = $("bulk-results");
  container.replaceChildren();
  const fragment = document.createDocumentFragment();
  for (const entry of results) {
    const row = document.createElement("div");
    row.className = "link-item";
    const target = document.createElement("span");
    target.className = "link-long";
    target.textContent = entry.longUrl;
    row.appendChild(target);
    if (H.validHttpUrl(entry.shortUrl)) {
      const a = document.createElement("a");
      a.href = entry.shortUrl;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.textContent = entry.shortUrl;
      row.appendChild(a);
    }
    const note = document.createElement("span");
    note.textContent = entry.error ? "Error: " + entry.error :
      entry.already ? t("bulkExisting", "Existing") : t("bulkCreated", "Created");
    row.appendChild(note);
    fragment.appendChild(row);
  }
  container.appendChild(fragment);
  $("bulk-copy").disabled = !results.some(x => x.shortUrl);
}
$("bulk-preview").addEventListener("click", () => {
  if (running) return;
  try {
    const urls = parseRows();
    status(urls.filter(x => !x.invalid).length + " valid unique URLs and " + urls.filter(x => x.invalid).length + " invalid rows. Existing links will be reused.");
  } catch (error) { status(error.message); }
});
$("bulk-start").addEventListener("click", async () => {
  if (running) return;
  let urls;
  try { urls = parseRows(); } catch (error) { return status(error.message); }
  if (!urls.length) return status("Enter at least one URL.");
  // Fail once, before a large batch, when credentials or host access are unavailable.
  try {
    const connection = await browser.runtime.sendMessage({ type: "CHECK_CONNECTION" });
    if (!connection?.ok) throw new Error(connection?.reason || "Cannot connect to YOURLS.");
  } catch (error) { return status("Connection check failed: " + error.message); }
  running = true;
  stopRequested = false;
  results = [];
  render();
  $("bulk-start").disabled = true;
  $("bulk-preview").disabled = true;
  $("bulk-stop").disabled = false;
  $("bulk-size").disabled = true;
  $("bulk-input").disabled = true;
  const batchSize = Number($("bulk-size").value) || 10;
  let succeeded = 0, failed = 0, reused = 0;
  try {
    // YOURLS allocates keywords non-atomically: never send concurrent creates.
    // "batchSize" only controls UI refresh frequency, not API concurrency.
    for (const item of urls) {
      if (stopRequested) break;
      let result;
      if (item.invalid) result={longUrl:item.longUrl,error:"Invalid HTTP(S) URL on line " + item.line};
      else {
        try {
          const response=await browser.runtime.sendMessage({type:"SHORTEN_URL",longUrl:item.longUrl,bulk:true});
          if (!response?.ok || !H.validHttpUrl(response.shortUrl))
            throw new Error(response?.reason || "No valid short URL returned.");
          result={longUrl:item.longUrl,shortUrl:response.shortUrl,already:!!response.already};
        } catch(error){result={longUrl:item.longUrl,error:String(error.message||error).slice(0,200)};}
      }
      results.push(result);
      if(result.error) failed++;else {succeeded++;if(result.already)reused++;}
      // Update after every N entries, but always show last and stop requests promptly.
      if (results.length % batchSize===0 || results.length===urls.length || stopRequested) {
        $("bulk-progress").value=Math.round(results.length/urls.length*100);
        status(results.length+"/"+urls.length+" processed — "+succeeded+
          " successful ("+reused+" existing), "+failed+" failed.");
        render();
      }
    }
    $("bulk-progress").value=Math.round(results.length/urls.length*100);
    render();
    status(results.length+"/"+urls.length+" processed — "+succeeded+
      " successful ("+reused+" existing), "+failed+" failed.");
  } finally {
    running = false;
    $("bulk-start").disabled = false;
    $("bulk-preview").disabled = false;
    $("bulk-stop").disabled = true;
    $("bulk-size").disabled = false;
    $("bulk-input").disabled = false;
    await browser.runtime.sendMessage({type:"LOG_BULK", total: results.length, failures: failed}).catch(() => {});
    if (stopRequested) status("Stopped. " + results.length + "/" + urls.length + " URLs processed.");
  }
});
$("bulk-stop").addEventListener("click", () => {
  stopRequested = true;
  $("bulk-stop").disabled = true;
  status("Stopping after current request…");
});
$("bulk-copy").addEventListener("click", async () => {
  const text = results.filter(r => r.shortUrl).map(r => r.longUrl + "\t" + r.shortUrl).join("\n");
  if (!text) return;
  try { await navigator.clipboard.writeText(text); status("Copied original and short URLs."); }
  catch (error) { status(error.message); }
});
localize();
