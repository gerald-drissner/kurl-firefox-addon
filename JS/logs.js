/* Local, URL-free diagnostic activity log. */
"use strict";
const $ = id => document.getElementById(id);
document.documentElement.lang = browser.i18n.getUILanguage().split("-")[0];
document.documentElement.dir = browser.i18n.getMessage("@@bidi_dir") || "ltr";
const t = (key, fallback) => browser.i18n.getMessage(key) || fallback;
document.querySelectorAll("[data-i18n-key]").forEach(el => {
  const translated = browser.i18n.getMessage(el.dataset.i18nKey);
  if (translated) el.textContent = translated;
});
const PAGE_SIZE = 15;
let entries = [];
let page = 0;
function description(entry) {
  const names = {
    SHORTEN_URL: t("logShorten", "Short URL created / reused"),
    DELETE_SHORTURL: t("logDelete", "Short URL deleted"),
    LOOKUP_URL: t("logLookup", "Link lookup"),
    UPDATE_URL: t("logUpdate", "Link edited"),
    REGENERATE_URL: t("logRegenerate", "Link regenerated"),
    RIGHT_CLICK_COPY: t("logRightCopy", "Right-click: URL shortened and copied"),
    RIGHT_CLICK_INSERT: t("logRightInsert", "Right-click: URL shortened and inserted"),
    RIGHT_CLICK_FAILED: t("logRightFailed", "Right-click: failed")
  };
  return names[entry.action] || String(entry.action || "");
}
function exportText() {
  const heading = ["Date", "Action", "Status"].join("\t");
  const rows = entries.map(row => [new Date(row.time).toISOString(),
    description(row), row.level === "error" ? "error" : "ok"].join("\t"));
  return [heading, ...rows].join("\n") + "\n";
}
function render() {
  const area = $("log-results");
  area.replaceChildren();
  const pages = Math.max(1, Math.ceil(entries.length / PAGE_SIZE));
  page = Math.min(page, pages - 1);
  $("log-page").textContent = t("logPage", "Page") + " " + (page + 1) + " / " + pages;
  $("log-prev").disabled = page === 0;
  $("log-next").disabled = page >= pages - 1;
  const segment = entries.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  if (!segment.length) {
    const text = document.createElement("p");
    text.textContent = t("logEmpty", "No recent activity.");
    area.appendChild(text);
  }
  for (const entry of segment) {
    const row = document.createElement("div");
    row.className = "log-item";
    const when = document.createElement("time");
    const date = new Date(entry.time);
    when.textContent = Number.isNaN(+date) ? "—" : date.toLocaleString();
    const action = document.createElement("span");
    action.textContent = description(entry);
    const level = document.createElement("span");
    level.className = "log-level " + (entry.level === "error" ? "log-error" : "log-ok");
    level.textContent = entry.level === "error" ? t("logFailed", "Failed") : t("logCompleted", "Completed");
    row.append(when, action, level);
    area.appendChild(row);
  }
  $("log-copy").disabled = entries.length === 0;
  $("log-download").disabled = entries.length === 0;
}
async function load() {
  try {
    const response = await browser.runtime.sendMessage({ type: "GET_LOG" });
    if (!response?.ok) throw new Error(response?.reason || "Cannot load log.");
    entries = Array.isArray(response.data) ? response.data : [];
    page = 0;
    $("log-status").textContent = entries.length + " " + t("logEntries", "entries in the last 7 days");
    render();
  } catch (error) { $("log-status").textContent = error.message; }
}
$("log-refresh").addEventListener("click", load);
$("log-clear").addEventListener("click", async () => {
  if (!confirm(t("logConfirmClear", "Clear the local kURL activity log?"))) return;
  const result = await browser.runtime.sendMessage({ type: "CLEAR_LOG" });
  if (!result?.ok) return void($("log-status").textContent = result?.reason || "Cannot clear log.");
  await load();
});
$("log-prev").addEventListener("click", () => { if(page) { page--; render(); } });
$("log-next").addEventListener("click", () => { if ((page+1)*PAGE_SIZE < entries.length) { page++;render(); } });
$("log-copy").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(exportText());
    $("log-status").textContent = t("logCopied", "Log copied to clipboard.");
  } catch (error) { $("log-status").textContent = error.message; }
});
$("log-download").addEventListener("click", () => {
  const blob = new Blob([exportText()], {type:"text/plain;charset=utf-8"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "kurl-activity-" + new Date().toISOString().slice(0,10) + ".txt";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 15000);
});
load();
