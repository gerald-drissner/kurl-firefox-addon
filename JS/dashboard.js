/* kURL dashboard: render untrusted YOURLS data with DOM APIs, never innerHTML. */
"use strict";
const H = window.Helpers;
const $ = id => document.getElementById(id);
const t = (key, fallback) => browser.i18n.getMessage(key) || fallback;
const PAGE_SIZE = 10;
let currentOffset = 0;
let recentLinks = [];
let loadingMoreGeneration = -1;
let viewGeneration = 0;
let helperReady = false;
let helperSourcePromise = null;
let helperInitialState = true;
let showCopyNotifications = true;
let copyToastTimer = null;
function showCopiedToast(shortUrl) {
  if (!showCopyNotifications) return;
  const toast = $("copy-toast");
  clearTimeout(copyToastTimer);
  // Trusted UI string only. Do not render the URL or untrusted server text as HTML.
  toast.textContent = t("dashCopyToast", "Copied to clipboard") + ": " + shortUrl;
  toast.hidden = false;
  copyToastTimer = setTimeout(() => {
    toast.hidden = true;
    toast.textContent = "";
  }, 2800);
}
function hideCopiedToast() {
  clearTimeout(copyToastTimer);
  $("copy-toast").hidden = true;
  $("copy-toast").textContent = "";
}

function message(el, value, error = false) {
  el.textContent = String(value);
  el.className = error ? "info error-message" : "info";
}
function formatNumber(value) {
  return (Number(value) || 0).toLocaleString();
}
function i18n() {
  document.documentElement.lang = browser.i18n.getUILanguage().split("-")[0];
  document.documentElement.dir = browser.i18n.getMessage("@@bidi_dir") || "ltr";
  document.querySelectorAll("[data-i18n-placeholder]").forEach(el => {
    const translated = browser.i18n.getMessage(el.dataset.i18nPlaceholder);
    if (translated) el.placeholder = translated;
  });
  document.querySelectorAll("[data-i18n-key]").forEach(el => {
    const translated = browser.i18n.getMessage(el.dataset.i18nKey);
    if (translated) el.textContent = translated;
  });
  const viewMoreLabel = t("dashboardBtnViewMore", "View More");
  const filterHelp = browser.i18n.getMessage("dashFilterHelp", [viewMoreLabel]);
  if (filterHelp) document.querySelector(".filter-scope-help").textContent = filterHelp;
}
async function send(type, extra = {}) {
  const response = await browser.runtime.sendMessage({ type, ...extra });
  if (!response?.ok) {
    const error = new Error(response?.reason || "YOURLS request failed.");
    error.code = response?.errorCode || "";
    throw error;
  }
  return response;
}
function parseLinks(raw) {
  const links = raw?.links || raw?.stats?.links || {};
  return (Array.isArray(links) ? links : Object.values(links))
    .filter(link => link && typeof link === "object");
}
function makeButton(title, callback, className = "secondary") {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.textContent = title;
  button.addEventListener("click", callback);
  return button;
}
function makeLinkRow(link, rank = null) {
  const row = document.createElement("article");
  row.className = "link-item";
  const texts = document.createElement("div");
  texts.className = "link-urls";
  if (Number.isInteger(rank)) {
    const rankBadge = document.createElement("span");
    rankBadge.className = "link-rank";
    rankBadge.textContent = String(rank);
    rankBadge.setAttribute("aria-label", t("dashRank", "Rank") + " " + rank);
    row.appendChild(rankBadge);
    row.classList.add("ranked-link");
  }
  const short = H.validHttpUrl(link.shorturl);
  const target = H.validHttpUrl(link.url || link.longurl);
  if (short) {
    const anchor = document.createElement("a");
    anchor.href = short;
    anchor.target = "_blank";
    anchor.rel = "noopener noreferrer";
    anchor.className = "link-short";
    anchor.textContent = short.replace(/^https?:\/\//i, "");
    texts.appendChild(anchor);
  } else {
    const span = document.createElement("span");
    span.textContent = "Invalid short URL";
    texts.appendChild(span);
  }
  const long = document.createElement("span");
  long.className = "link-long";
  long.title = target || String(link.url || link.longurl || "");
  long.textContent = String(link.title || target || "No valid target URL");
  if (link.title && target) {
    const detail = document.createElement("small");
    detail.className = "link-long";
    detail.textContent = target;
    texts.appendChild(detail);
  }
  texts.appendChild(long);
  const created = link.timestamp || link.date;
  if (created) {
    const date = document.createElement("small");
    date.className = "kurl-date";
    date.textContent = String(created).slice(0, 32);
    texts.appendChild(date);
  }
  row.appendChild(texts);
  const actions = document.createElement("div");
  actions.className = "kurl-actions";
  const clicks = document.createElement("span");
  clicks.className = "link-clicks";
  const count = formatNumber(link.clicks);
  clicks.textContent = browser.i18n.getMessage("dashboardLabelClicks", [count]) || "Clicks: " + count;
  actions.appendChild(clicks);
  if (short) {
    actions.appendChild(makeButton(t("popupBtnCopy", "Copy"), async () => {
      try {
        await navigator.clipboard.writeText(short);
        showCopiedToast(short);
      } catch (error) {
        message($("dashboard-feedback"), "Cannot copy to clipboard: " + error.message, true);
      }
    }));
    if (helperReady && target) {
      actions.appendChild(makeButton(t("dashEdit", "Edit"), () => {
        $("manual-long").value = target;
        $("manual-result").value = short;
        $("manual-keyword").value = H.extractKeyword($("info-server").textContent,short);
        $("manual-title-input").value = String(link.title || "").slice(0,300);
        updateManualButtons();
        $("manual-long").focus();
        message($("manual-status"),t("dashEditReady","Selected an existing link. Use Update existing link to change its destination."));
        $("manual-form").scrollIntoView({block:"center",behavior:"smooth"});
      }));
    }
    if (helperReady) {
      actions.appendChild(makeButton(t("popupBtnDelete", "Delete"), async () => {
        const question = t("confirmDelete", "Delete this short URL permanently? Existing websites and sent emails may refer to it.");
        if (!window.confirm(question + "\n" + short)) return;
        try {
          await send("DELETE_SHORTURL", { shortUrl: short });
          message($("dashboard-feedback"), t("popupStatusDeleted", "Short URL deleted.") + " " + short);
          await refresh();
        } catch (error) {
          message($("dashboard-feedback"), error.message, true);
        }
      }, "danger"));
    }
  }
  row.appendChild(actions);
  return row;
}
function renderRows(container, items, emptyText, ranked = false) {
  container.replaceChildren();
  if (!items.length) {
    const p = document.createElement("p");
    p.textContent = emptyText;
    container.appendChild(p);
    return;
  }
  const fragment = document.createDocumentFragment();
  for (const [i, item] of items.entries()) fragment.appendChild(makeLinkRow(item, ranked ? i + 1 : null));
  container.appendChild(fragment);
}
function filterRecent() {
  const query = $("filter-links").value.trim().toLowerCase();
  const visible = recentLinks.filter(link =>
    String(link.shorturl || "").toLowerCase().includes(query) ||
    String(link.url || link.longurl || "").toLowerCase().includes(query) ||
    String(link.title || "").toLowerCase().includes(query) ||
    String(link.keyword || "").toLowerCase().includes(query)
  );
  renderRows($("recent-links-container"), visible,
    query ? t("dashFilterNoMatch", "No matching links among the currently displayed recent links.") : t("dashboardNoLinksFound", "No links found."));
}
async function loadMore(generation) {
  if (loadingMoreGeneration === generation) return;
  loadingMoreGeneration = generation;
  const area = $("view-more-container");
  area.replaceChildren();
  const loading = document.createElement("span");
  loading.textContent = t("dashboardStatusLoading", "Loading…");
  area.appendChild(loading);
  try {
    const response = await send("GET_RECENT_LINKS", {
      limit: PAGE_SIZE, start: currentOffset
    });
    if (generation !== viewGeneration) return;
    const links = parseLinks(response.data);
    recentLinks.push(...links);
    currentOffset += links.length;
    filterRecent();
    area.replaceChildren();
    if (links.length === PAGE_SIZE) {
      area.appendChild(makeButton(
        t("dashboardBtnViewMore", "Load more"),
        () => loadMore(viewGeneration)
      ));
    }
  } catch (error) {
    if (generation !== viewGeneration) return;
    area.replaceChildren();
    message($("dashboard-feedback"), "Recent links: " + error.message, true);
    area.appendChild(makeButton("Retry", () => loadMore(viewGeneration)));
  } finally {
    if (loadingMoreGeneration === generation) loadingMoreGeneration = -1;
  }
}
function showAuthRecovery(code) {
  const panel = $("dashboard-auth-recovery");
  panel.hidden = !["AUTH_REJECTED", "ACCESS_DENIED"].includes(code);
  const server = H.sanitizeBaseUrl($("info-server").textContent);
  if (server) $("dashboard-auth-tools").href = server + "/admin/tools.php";
}
async function refresh(forceHelper = false) {
  const generation = ++viewGeneration;
  showAuthRecovery("");
  let settings;
  try { settings = await H.getSettings(); }
  catch (error) { message($("dashboard-feedback"), String(error.message || error), true); return; }
  if (generation !== viewGeneration) return;
  const ready = Boolean(settings.yourlsUrl && settings.apiSignature);
  document.querySelector(".dashboard-shell").classList.toggle("is-unconfigured", !ready);
  $("dashboard-onboarding").hidden = ready;
  if (!ready) {
    helperReady = false;
    clearLookup();
    $("lookup-message").textContent = "";
    message($("dashboard-feedback"), t("dashboardSetupStatus", "Connect your YOURLS server to get started."));
    $("refresh-btn").disabled = false;
    return;
  }
  currentOffset = 0;
  recentLinks = [];
  $("view-more-container").replaceChildren();
  $("top-links-container").replaceChildren();
  $("recent-links-container").replaceChildren();
  $("refresh-btn").disabled = true;
  message($("dashboard-feedback"), t("dashboardStatusLoading", "Loading…"));
  try {
    const response = await send("GET_INFO",{forceHelper});
    if (generation !== viewGeneration) return;
    const info = response.data;
    helperReady = info.helperReady;
    // The installer remains available even when the helper is already installed.
    // Open it automatically only on the first missing/outdated status check.
    if (helperInitialState) {
      $("helper-instructions").open = !info.helperReady;
      $("helper-panel").open = !info.helperReady;
      helperInitialState = false;
    }
    const state = $("helper-indicator");
    state.className = "helper-indicator " + (info.helperReady ? "helper-ok" : "helper-missing");
    state.textContent = info.helperReady
      ? t("helperFound", "Helper plugin: INSTALLED / OK") + " (" + info.helperVersion + ")"
      : info.helperVersion
        ? t("helperOutdated", "Helper plugin: UPDATE REQUIRED") + " (" + info.helperVersion + ")"
        : t("helperMissing", "Helper plugin: NOT FOUND");
    $("helper-setup").dataset.state = info.helperReady ? "ready" : info.helperVersion ? "outdated" : "missing";
    $("helper-indicator").hidden = info.helperReady;
    $("helper-panel-summary").textContent = info.helperReady
      ? t("helperCompactOk", "Helper installed") + " (" + info.helperVersion + ") · " + t("helperShowDetails", "Setup and source")
      : info.helperVersion ? t("helperOutdated", "Helper update required") : t("helperMissing", "Helper not found");

    $("manual-lookup").disabled = !helperReady;
    updateManualButtons();
    if (lookedUp) {
      $("lookup-edit").hidden = !helperReady || !lookedUp.shortUrl;
      $("lookup-delete").hidden = !helperReady || !lookedUp.shortUrl;
    }
    $("total-links").textContent = formatNumber(info.totalLinks);
    $("total-clicks").textContent = formatNumber(info.totalClicks);
    $("avg-clicks").textContent = info.totalLinks > 0
      ? (info.totalClicks / info.totalLinks).toFixed(1) : "0.0";
    $("server-status").textContent = t("dashboardStatusOnline", "Online");
    $("server-status").classList.add("status-online");
    $("info-server").textContent = info.base || "—";
    updateLookupPlaceholder(info.base);
    $("info-version").textContent = info.yourlsVersion || "Unknown";
    $("info-helper").textContent = info.helperReady
      ? "Ready (" + info.helperVersion + ")"
      : info.helperVersion ? "Outdated (" + info.helperVersion + ")" : "Not installed / unavailable";
    message($("dashboard-feedback"), "Connected to " + info.base);
    try { $("info-activity").textContent = formatNumber((await send("GET_LOG")).data.length); }
    catch { $("info-activity").textContent = "—"; }
  } catch (error) {
    if (generation !== viewGeneration) return;
    updateLookupPlaceholder("");
    helperReady = false;
    // Keep the local installation instructions available if the connection fails.
    $("helper-indicator").hidden = false;
    $("helper-setup").dataset.state = "unknown";
    $("helper-panel-summary").textContent = t("helperUnknown", "Helper plugin: status unknown");
    $("helper-indicator").textContent = t("helperUnknown", "Helper plugin: status unknown");
    $("helper-indicator").className = "helper-indicator helper-missing";
    $("server-status").textContent = t("dashboardStatusError", "Error");
    $("server-status").classList.remove("status-online");
    message($("dashboard-feedback"), error.message, true);
    // Do not repeat a rejected signature three times under different headings.
    const config = await H.getSettings();
    $("info-server").textContent = config.yourlsUrl || "—";
    showAuthRecovery(error.code);
    $("refresh-btn").disabled = false;
    return;
  }
  const topTask = (async () => {
    try {
      const top = await send("GET_TOP_LINKS", { limit: 10 });
      if (generation === viewGeneration) {
        renderRows($("top-links-container"), parseLinks(top.data), "No top links found.", true);
      }
    } catch (error) {
      if (generation === viewGeneration) {
        renderRows($("top-links-container"), [], "Could not load top links: " + error.message);
      }
    }
  })();
  const recentTask = generation === viewGeneration
    ? loadMore(generation) : Promise.resolve();
  await Promise.all([topTask, recentTask]);
  if (generation === viewGeneration) $("refresh-btn").disabled = false;
}
// Server-backed lookup is separate from the filter on the already-loaded recent list.
let lookupGeneration = 0;
let lookedUp = null;
function clearLookup() {
  lookedUp = null;
  $("lookup-result").hidden = true;
  $("lookup-copy").hidden = true;
  $("lookup-edit").hidden = true;
  $("lookup-delete").hidden = true;
  $("lookup-create").hidden = true;
  $("lookup-short").textContent = "—";
  $("lookup-long").textContent = "—";
  $("lookup-clicks").textContent = "—";
  $("lookup-title").textContent = "—";
}
function showLookup(data, found = true) {
  lookedUp = data;
  $("lookup-result").hidden = false;
  $("lookup-result-title").textContent = found
    ? t("lookupResultHeading", "Found link") : t("lookupNotFound", "No short link found");
  $("lookup-short").textContent = data.shortUrl || "—";
  $("lookup-long").textContent = data.target || "—";
  $("lookup-clicks").textContent = data.clicks == null ? "—" : formatNumber(data.clicks);
  $("lookup-title").textContent = data.title || "—";
  $("lookup-copy").hidden = !found;
  $("lookup-edit").hidden = !found || !helperReady || !H.validHttpUrl(data.target);
  $("lookup-delete").hidden = !found || !helperReady || !H.extractKeyword($( "info-server" ).textContent, data.shortUrl || "");
  $("lookup-create").hidden = found || !H.validHttpUrl(data.target);
}
async function deleteLookedUp() {
  if (!helperReady || !lookedUp?.shortUrl || $("lookup-delete").hidden) return;
  const shortUrl = lookedUp.shortUrl;
  const keyword = H.extractKeyword($("info-server").textContent, shortUrl);
  if (!keyword) return;
  if (!window.confirm(t("confirmDelete", "Delete this short URL permanently? Existing websites and sent emails may refer to it.") + "\n" + shortUrl)) return;
  // No new result should be accepted as the stale result during the mutation.
  const generation = ++lookupGeneration;
  $("lookup-delete").disabled = true;
  try {
    await send("DELETE_SHORTURL", {shortUrl});
    // Refresh server lists after ANY successful delete, even if the user edits
    // the search field while the DELETE_SHORTURL request is pending.
    // Only replace the lookup result if it still belongs to this operation.
    if (generation === lookupGeneration) {
      clearLookup();
      $("lookup-message").textContent = t("popupStatusDeleted", "Short URL deleted.");
    }
    await refresh();
  } catch (error) {
    if (generation === lookupGeneration) $("lookup-message").textContent = String(error.message || error);
  } finally { $("lookup-delete").disabled = false; }
}
function determineLookup(raw, base) {
  return H.classifyLookupInput(base, raw);
}
function updateLookupPlaceholder(base) {
  const configured = H.sanitizeBaseUrl(base);
  const example = (configured || "https://short.example") + "/example";
  $("lookup-query").placeholder = browser.i18n.getMessage("lookupQueryPlaceholder", [example]) ||
    (example + " or https://example.com/article");
}
function clickCount(response) {
  const j = response?.data || {};
  const item = j.link || j.url || j.stats?.link || {};
  const numeric = item.clicks ?? j.clicks;
  return numeric == null || numeric === "" || !Number.isFinite(Number(numeric)) ? null : Number(numeric);
}
async function searchLinks(event) {
  event.preventDefault();
  const generation = ++lookupGeneration;
  clearLookup();
  const base = H.sanitizeBaseUrl($('info-server').textContent);
  const query = base ? determineLookup($('lookup-query').value, base) : null;
  if (!query || query.kind === "own-invalid") {
    $("lookup-message").textContent = query?.kind === "own-invalid"
      ? t("lookupOwnInvalid", "This address belongs to your YOURLS server but is not a valid short link. Enter a short keyword or a short URL from this server.")
      : t("lookupInvalid", "Enter a valid destination URL, short URL on this server, or keyword.");
    return;
  }
  if (query.kind === "long" && !helperReady) {
    $("lookup-message").textContent = t("lookupNeedsHelper", "Searching by destination URL requires the optional YOURLS Helper. Short-URL lookup still works without it.");
    return;
  }
  $("lookup-submit").disabled = true;
  $("lookup-message").textContent = t("lookupSearching", "Searching YOURLS…");
  try {
    if (query.kind === "short") {
      // The core expand API identifies the target; url-stats supplies the click count.
      // A missing target is a real lookup failure, not an invitation to edit blindly.
      const expand = await send("EXPAND_URL", {shortUrl:query.shortUrl});
      if (generation !== lookupGeneration) return;
      const item = expand.data;
      let clicks = null;
      try { clicks = clickCount(await send("GET_STATS", {shortUrl:query.shortUrl})); }
      catch { /* Keep the valid target visible if statistics are temporarily unavailable. */ }
      if (generation !== lookupGeneration) return;
      showLookup({shortUrl:item.shortUrl,target:item.target,title:item.title,clicks});
      $("lookup-message").textContent = t("lookupFound", "Link found on your YOURLS server.");
    } else {
      const result = (await send("LOOKUP_URL", {longUrl:query.target})).data;
      if (generation !== lookupGeneration) return;
      if (!result.found) {
        showLookup({target:query.target}, false);
        $("lookup-message").textContent = t("lookupNotFoundHelp", "No short link found for this URL. You can create one.");
      } else {
        let clicks = null;
        try { clicks = clickCount(await send("GET_STATS", {shortUrl:result.shortUrl})); }
        catch { /* Lookup succeeded; preserve result even if stats fail. */ }
        if (generation !== lookupGeneration) return;
        showLookup({shortUrl:result.shortUrl,target:result.target || query.target,title:result.title,clicks});
        $("lookup-message").textContent = t("lookupFound", "Link found on your YOURLS server.");
      }
    }
  } catch (error) {
    if (generation !== lookupGeneration) return;
    $("lookup-message").textContent = error.message || String(error);
  } finally {
    if (generation === lookupGeneration) $("lookup-submit").disabled = false;
  }
}
function fillManualFromLookup(forEditing) {
  if (!lookedUp?.target || !H.validHttpUrl(lookedUp.target)) return;
  $("manual-long").value = lookedUp.target;
  $("manual-result").value = forEditing ? lookedUp.shortUrl : "";
  $("manual-keyword").value = forEditing
    ? H.extractKeyword($("info-server").textContent, lookedUp.shortUrl) : "";
  $("manual-title-input").value = forEditing ? (lookedUp.title || "").slice(0,300) : "";
  updateManualButtons();
  $("manual-long").focus();
  $("manual-form").scrollIntoView({block:"center",behavior:"smooth"});
  message($("manual-status"), forEditing
    ? t("dashEditReady", "Selected an existing link. Use Update to change it.")
    : t("dashNewReady", "Ready to create a short URL."));
}

function selectedShort() {
  const value = $("manual-result").value.trim();
  if (!value) return "";
  const base = $("info-server").textContent;
  return H.extractKeyword(base, value) ? value : "";
}
function updateManualButtons() {
  $("manual-copy").disabled = !selectedShort();
  $("manual-regenerate").disabled = !helperReady || !selectedShort();
  $("manual-update").disabled = !helperReady || !selectedShort();
}
async function lookup() {
  const input = H.validHttpUrl($("manual-long").value);
  if (!input) return message($("manual-status"), "Enter a valid target URL.", true);
  $("manual-lookup").disabled = true;
  try {
    const r = await send("LOOKUP_URL", { longUrl: input, preferredShort: selectedShort() });
    $("manual-result").value = r.data.found ? r.data.shortUrl : "";
    if (r.data.found) $("manual-keyword").value = r.data.keyword;
    updateManualButtons();
    message($("manual-status"), r.data.found
      ? t("dashFound", "Existing short URL found.")
      : t("dashNotFound", "No existing short URL found. You can create one."));
  } catch (error) {
    message($("manual-status"), error.message, true);
  } finally { $("manual-lookup").disabled = false; }
}
async function createNew(event) {
  event.preventDefault();
  const input = H.validHttpUrl($("manual-long").value);
  if (!input) return message($("manual-status"), "Enter a valid target URL.", true);
  $("manual-submit").disabled = true;
  message($("manual-status"),t("dashCreating","Creating short URL…"));
  try {
    const response = await send("SHORTEN_URL", {
      longUrl: input, keyword: $("manual-keyword").value.trim(),
      title: $("manual-title-input").value.trim()
    });
    $("manual-result").value = response.shortUrl;
    // A custom slug applies to this creation only. Never carry it into the next Create.
    // Existing-link edits get their keyword again when the user clicks Edit.
    $("manual-keyword").value = "";
    updateManualButtons();
    message($("manual-status"), response.already
      ? t("popupInfoAlreadyShortened","This URL already has a short link.")
      : t("popupStatusCreated","Short URL created."));
    if (response.keywordAdjusted && !response.already)
      message($("manual-status"),t("keywordAdjusted","YOURLS changed your keyword."));
    void refresh();
  } catch (error) {
    message($("manual-status"), error.message, true);
  } finally { $("manual-submit").disabled = false; }
}
async function updateExisting() {
  const input = H.validHttpUrl($("manual-long").value);
  const previous = selectedShort();
  if (!helperReady || !input || !previous)
    return message($("manual-status"),t("dashSelectToEdit","Choose an existing short URL and a valid target first."),true);
  if (!confirm(t("confirmUpdate","Update this existing short URL? Its target might already be used in websites and sent emails."))) return;
  $("manual-update").disabled = true;
  try {
    const response = await send("UPDATE_URL", {
      longUrl:input,shortUrl:previous,keyword:$("manual-keyword").value.trim(),
      title:$("manual-title-input").value.trim()
    });
    $("manual-result").value=response.shortUrl;
    $("manual-keyword").value=H.extractKeyword($("info-server").textContent,response.shortUrl);
    message($("manual-status"),t("dashUpdated","Existing short URL updated."));
    void refresh();
  } catch(error) {message($("manual-status"),error.message,true);}
  finally {updateManualButtons();}
}
async function regenerate() {
  const input = H.validHttpUrl($("manual-long").value);
  const short = selectedShort();
  if (!helperReady || !short || !input) return message($("manual-status"),
    "Choose an existing short URL and valid target first.", true);
  if (!confirm(t("confirmRegenerate", "Regenerate this short URL? Changing its keyword can break links in websites and sent emails."))) return;
  $("manual-regenerate").disabled = true;
  try {
    const response = await send("REGENERATE_URL", {
      longUrl: input, shortUrl: short,
      // An empty keyword tells kURL Helper to generate a random one.
      keyword: $("manual-keyword").value.trim(),
      title: $("manual-title-input").value.trim()
    });
    $("manual-result").value = response.shortUrl;
    $("manual-keyword").value = response.keyword;
    message($("manual-status"), "Existing short URL regenerated safely.");
    void refresh();
  } catch (error) {
    message($("manual-status"), error.message, true);
  } finally { updateManualButtons(); }
}

// Read only our bundled, static helper file. Never load executable code from a remote server.
async function getBundledHelperCode() {
  if (!helperSourcePromise) {
    helperSourcePromise = (async () => {
      const response = await fetch(browser.runtime.getURL("helper/kurl-helper/plugin.php"), {
        redirect: "error", credentials: "omit", cache: "no-store"
      });
      if (!response.ok) throw new Error("Bundled helper file unavailable.");
      const code = await response.text();
      if (!code.replace(/\r\n/g, "\n").startsWith("<?php\n/*\nPlugin Name: kURL Helper\n") || code.length > 100000) {
        throw new Error("Invalid bundled Helper source.");
      }
      return code;
    })().catch(error => { helperSourcePromise = null; throw error; });
  }
  return helperSourcePromise;
}
function helperFeedback(value, error = false) {
  const node = $("helper-file-status");
  node.textContent = value;
  node.className = error ? "kurl-help error-message" : "kurl-help";
}
async function withHelperButton(button, action) {
  button.disabled = true;
  try { await action(await getBundledHelperCode()); }
  catch (error) { helperFeedback(String(error.message || error), true); }
  finally { button.disabled = false; }
}
$("helper-copy").addEventListener("click", () => withHelperButton($("helper-copy"), async code => {
  await navigator.clipboard.writeText(code);
  helperFeedback(t("helperCopyDone", "Complete plugin.php source copied to clipboard."));
}));
$("helper-download").addEventListener("click", () => withHelperButton($("helper-download"), async code => {
  const blob = new Blob([code], { type: "text/x-php;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  try {
    const link = document.createElement("a");
    link.href = url;
    link.download = "plugin.php";
    document.body.appendChild(link);
    link.click();
    link.remove();
    helperFeedback(t("helperDownloadStarted", "plugin.php download requested. Verify its filename in the downloads folder."));
  } finally {
    // Delay revocation to give Thunderbird's download manager time to open the blob URL.
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
}));
$("helper-code-details").addEventListener("toggle", async event => {
  if (!event.target.open || $("helper-code").dataset.loaded) return;
  try {
    $("helper-code").textContent = await getBundledHelperCode();
    $("helper-code").dataset.loaded = "true";
  } catch (error) {
    helperFeedback(String(error.message || error), true);
  }
});
i18n();
updateLookupPlaceholder("");
(async () => {
  const settings = await H.getSettings();
  showCopyNotifications = settings.showCopyNotifications;
  $("dash-copy-notifications").checked = showCopyNotifications;
})().catch(error => console.warn("kURL: Could not read copy notification preference", error));
$("dash-copy-notifications").addEventListener("change", async () => {
  const box = $("dash-copy-notifications");
  const choice = box.checked;
  try {
    await H.setSettings({showCopyNotifications: choice});
    showCopyNotifications = choice;
    if (!choice) hideCopiedToast();
  } catch (error) {
    box.checked = !choice;
    message($("dashboard-feedback"), error.message || String(error), true);
  }
});
browser.storage.onChanged?.addListener((changes, area) => {
  if (area !== "local" || !changes.showCopyNotifications) return;
  showCopyNotifications = changes.showCopyNotifications.newValue !== false;
  $("dash-copy-notifications").checked = showCopyNotifications;
  if (!showCopyNotifications) hideCopiedToast();
});
$("refresh-btn").addEventListener("click", () => refresh(true));
$("manual-form").addEventListener("submit", createNew);
$("manual-update").addEventListener("click",updateExisting);
$("manual-lookup").addEventListener("click", lookup);
$("manual-regenerate").addEventListener("click", regenerate);
$("manual-reset").addEventListener("click", () => {
  $("manual-long").value = "";
  $("manual-keyword").value = "";
  $("manual-title-input").value = "";
  $("manual-result").value = "";
  updateManualButtons();
  message($("manual-status"), t("dashNewReady", "Ready for a new short URL."));
  $("manual-long").focus();
});
$("manual-copy").addEventListener("click", async () => {
  try {
    const short = $("manual-result").value;
    await navigator.clipboard.writeText(short);
    showCopiedToast(short);
  } catch (error) {
    message($("manual-status"), error.message, true);
  }
});
$("filter-links").addEventListener("input", filterRecent);
$("lookup-form").addEventListener("submit", searchLinks);
$("lookup-query").addEventListener("input", () => { ++lookupGeneration; clearLookup(); $("lookup-message").textContent = ""; $("lookup-submit").disabled = false; });
$("lookup-copy").addEventListener("click", async () => {
  if (!lookedUp?.shortUrl) return;
  try { await navigator.clipboard.writeText(lookedUp.shortUrl); showCopiedToast(lookedUp.shortUrl); }
  catch (error) { $("lookup-message").textContent = String(error.message || error); }
});
$("lookup-edit").addEventListener("click", () => fillManualFromLookup(true));
$("lookup-delete").addEventListener("click", deleteLookedUp);
$("lookup-create").addEventListener("click", () => fillManualFromLookup(false));
refresh();
// The target field may change while an existing short URL stays selected.
// Create and Update are separate explicit actions: never infer update from text changes.
