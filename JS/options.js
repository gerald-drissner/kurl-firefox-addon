/* kURL settings: test exactly what is entered; do not reuse tokens across hosts. */
"use strict";
const H = window.Helpers;
const $ = id => document.getElementById(id);
const t = (key, fallback) => browser.i18n.getMessage(key) || fallback;
let saved = { yourlsUrl: "", apiSignature: "", autoCopy: true, showCopyNotifications: true };
let connectionGeneration = 0;
function connectionLight(state, label) {
  const node = $("connection-indicator");
  node.className = "connection-indicator connection-" + state;
  $("connection-indicator-text").textContent = label;
}
function editedConnection() {
  ++connectionGeneration;
  connectionLight("neutral", t("connectionNotChecked", "Connection not checked for these settings"));
}
async function probeSavedConnection() {
  const generation = ++connectionGeneration;
  if (!saved.yourlsUrl || !saved.apiSignature) {
    connectionLight("neutral", t("connectionNotConfigured", "Connection not configured"));
    return;
  }
  connectionLight("checking", t("connectionChecking", "Checking YOURLS connection…"));
  try {
    // Never request a new host permission just by opening Settings.
    const permitted = await browser.permissions.contains({origins:[new URL(saved.yourlsUrl).origin + "/*"]});
    if (generation !== connectionGeneration) return;
    if (!permitted) {
      connectionLight("bad", t("connectionPermissionMissing", "YOURLS host permission missing"));
      return;
    }
    const result = await browser.runtime.sendMessage({type:"CHECK_CONNECTION",settings:{yourlsUrl:saved.yourlsUrl,apiSignature:saved.apiSignature}});
    if (generation !== connectionGeneration) return;
    connectionLight(result?.ok ? "ok" : "bad", result?.ok
      ? t("connectionOnline", "Connected — YOURLS API responded successfully")
      : t("connectionFailed", "Connection check failed — check the token and server"));
  } catch {
    if (generation === connectionGeneration) connectionLight("bad", t("connectionFailed", "Connection check failed — check the token and server"));
  }
}

function status(message, good = false, failed = false, errorCode = "") {
  $("status").textContent = message;
  $("status").className = good ? "info ok" : failed ? "info error-message" : "info";
  const recovery = $("options-auth-recovery");
  recovery.hidden = !["AUTH_REJECTED", "ACCESS_DENIED"].includes(errorCode);
  if (!recovery.hidden) {
    const base = H.sanitizeBaseUrl($("yourlsUrl").value);
    if (base) $("options-auth-tools").href = base + "/admin/tools.php";
    else recovery.hidden = true;
  }
}
function connection() {
  const base = H.sanitizeBaseUrl($("yourlsUrl").value);
  const token = $("apiSignature").value.trim();
  if (!base || !token) throw new Error(t("optionsStatusEnterUrlAndToken", "Enter a valid URL and API token."));
  if (base && saved.yourlsUrl && new URL(base).host !== new URL(saved.yourlsUrl).host && token === saved.apiSignature) {
    throw new Error("Server changed. Enter its own API signature; the previous token cannot be reused.");
  }
  return { yourlsUrl: base, apiSignature: token };
}
async function hostPermission(base) {
  const pattern = new URL(base).origin + "/*";
  const granted = await browser.permissions.request({ origins: [pattern] });
  if (!granted) throw new Error(t("optionsStatusPermNotGranted", "Host permission not granted."));
}
let testing = false;
async function test() {
  let config;
  try { config = connection(); } catch (error) { return status(error.message); }
  if (testing) return;
  testing = true;
  const checkGeneration = ++connectionGeneration;
  connectionLight("checking", t("connectionChecking", "Checking YOURLS connection…"));
  $("test").disabled = true;
  try {
    // Request immediately in a click handler while user activation is available.
    await hostPermission(config.yourlsUrl);
    status(t("dashboardStatusLoading", "Checking connection..."));
    const result = await browser.runtime.sendMessage({
      type: "CHECK_CONNECTION", settings: config
    });
    if (!result?.ok) {
      const authDenied = ["AUTH_REJECTED", "ACCESS_DENIED"].includes(result?.errorCode);
      const legacyHint = authDenied && config.apiSignature.length === 10
        ? " " + t("optionsOldTokenHint", "This ten-character token may be from an older YOURLS version. Copy the current API signature from Admin → Tools.") : "";
      const error = new Error((result?.reason || t("optionsStatusConnFailed", "Connection failed.")) + legacyHint);
      error.code = result?.errorCode || "";
      throw error;
    }
    // Commit only AFTER the API actually accepted the credentials.
    const finalSettings = { ...config, autoCopy: $("autoCopy").checked,
      showCopyNotifications: $("showCopyNotifications").checked };
    await H.setSettings(finalSettings);
    saved = finalSettings;
    if (checkGeneration === connectionGeneration) connectionLight("ok", t("connectionOnline", "Connected — YOURLS API responded successfully"));
    status(t("optionsStatusVerifiedSaved", "Connection verified and settings saved. " ) +
      (browser.i18n.getMessage("optionsStatusConnOk", String(result.total)) ||
        ("Total links: " + result.total)), true);
  } catch (error) {
    if (checkGeneration === connectionGeneration) connectionLight("bad", t("connectionFailed", "Connection check failed — check the token and server"));
    status(t("optionsStatusNotSaved", "Connection failed. Settings were not saved. ") +
      String(error.message || error), false, true, error.code);
  } finally {
    testing = false;
    $("test").disabled = false;
  }
}
async function save() {
  let config;
  try { config = connection(); } catch (error) { return status(error.message); }
  try {
    await hostPermission(config.yourlsUrl);
    await H.setSettings({ ...config, autoCopy: $("autoCopy").checked,
      showCopyNotifications: $("showCopyNotifications").checked });
    saved = { ...config, autoCopy: $("autoCopy").checked,
      showCopyNotifications: $("showCopyNotifications").checked };
    editedConnection();
    status(t("optionsStatusSavedUnchecked", "Settings saved without connection verification. You can test the connection later."));
  } catch (error) {
    status(String(error.message || error));
  }
}
async function revoke() {
  const base = H.sanitizeBaseUrl($("yourlsUrl").value);
  if (!base) return status(t("optionsStatusEnterUrlToRemove", "Enter your YOURLS URL."));
  try {
    await browser.permissions.remove({ origins: [new URL(base).origin + "/*"] });
    connectionLight("bad", t("connectionPermissionMissing", "YOURLS host permission missing"));
    ++connectionGeneration;
    status(t("optionsStatusPermRemoved", "Permission removed."));
  } catch (error) {
    status(t("optionsStatusPermRemoveError", "Could not remove permission: ") + error.message);
  }
}
function internationalize() {
  document.querySelectorAll("[data-i18n-key]").forEach(el => {
    const translated = browser.i18n.getMessage(el.dataset.i18nKey);
    if (translated) {
      if (el.hasAttribute("placeholder")) el.placeholder = translated;
      else el.textContent = translated;
    }
  });
}
async function init() {
  internationalize();
  document.documentElement.lang = browser.i18n.getUILanguage().split("-")[0];
  document.documentElement.dir = browser.i18n.getMessage("@@bidi_dir") || "ltr";

  saved = await H.getSettings();
  const raw = await browser.storage.local.get("yourlsUrl");
  const old = String(raw.yourlsUrl || "").trim();
  $("yourlsUrl").value = old.startsWith("http://")
    ? "https://" + old.slice("http://".length) : saved.yourlsUrl;
  $("apiSignature").value = saved.apiSignature;
  $("autoCopy").checked = saved.autoCopy;
  $("showCopyNotifications").checked = saved.showCopyNotifications;
  status(old.startsWith("http://") ?
    "Old HTTP connection detected. HTTPS has been filled in; test the connection and save the updated settings." :
    t("optionsStatusLoaded", "Settings loaded."));
  if (old.startsWith("http://")) editedConnection();
  else await probeSavedConnection();
}
$("showCopyNotifications").addEventListener("change", async () => {
  const box = $("showCopyNotifications");
  const choice = box.checked;
  try {
    // This UI preference is independent of YOURLS connection or API credentials.
    await H.setSettings({showCopyNotifications: choice});
    saved.showCopyNotifications = choice;
  } catch (error) {
    box.checked = !choice;
    status(String(error.message || error));
  }
});
browser.storage.onChanged?.addListener((changes, area) => {
  if (area === "local" && changes.showCopyNotifications) {
    $("showCopyNotifications").checked = changes.showCopyNotifications.newValue !== false;
    saved.showCopyNotifications = $("showCopyNotifications").checked;
  }
});
$("test").addEventListener("click", test);
$("save").addEventListener("click", save);
$("removePerm").addEventListener("click", revoke);
$("apiSignature").addEventListener("input", editedConnection);
$("yourlsUrl").addEventListener("input", () => {
  editedConnection();
  const base = H.sanitizeBaseUrl($("yourlsUrl").value);
  if (base && saved.yourlsUrl && new URL(base).host !== new URL(saved.yourlsUrl).host && $("apiSignature").value === saved.apiSignature) {
    $("apiSignature").value = "";
    status("Server changed. Enter the API signature for the new server.");
  }
});
init().catch(error => status(String(error.message || error)));
