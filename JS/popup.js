/**
 * kurl - popup.js
 * This script controls the user interface and logic within the main popup window.
 * It handles the entire UI lifecycle, from initial setup checks to user actions.
 *
 * version: 1.1 (Final)
 */

const H = window.Helpers;
const $ = (id) => document.getElementById(id);

// ==========================================================================
// INITIALIZATION
// ==========================================================================

/**
 * Main entry point when the popup is loaded.
 */
document.addEventListener('DOMContentLoaded', async () => {
  internationalize();

  $('open-settings-link').addEventListener('click', (e) => {
    e.preventDefault();
    browser.runtime.openOptionsPage();
    window.close();
  });

  // Check if the add-on has been configured with API credentials.
  const settings = await H.getSettings();
  if (!settings.yourlsUrl || !settings.apiSignature) {
    displaySetupMessage();
    return;
  }

  // Determine the initial state: pre-fill a URL or show the dashboard.
  const initial = await getInitialUrl(settings);
  if (initial.url) {
    if (initial.isShort) {
      handleExistingShortUrl(initial.url);
    } else {
      longUrl.value = initial.url;
    }
  } else {
    showDashboard();
  }

  // Clean up storage keys that were used for pre-filling.
  await browser.storage.local.remove(["yourls_prefill_long", "yourls_prefill_short"]);
  init();
});

// ==========================================================================
// ELEMENT REFERENCES
// ==========================================================================

const longUrl = $("longUrl");
const keyword = $("keyword");
const title = $("title");
const shortUrl = $("shortUrl");
const btnShorten = $("btnShorten");
const btnCopyClose = $("btnCopyClose");
const btnQrCode = $("btnQrCode");
const btnDownloadQr = $("btnDownloadQr");
const btnDelete = $("btnDelete");
const statsInput = $("statsInput");
const btnStats = $("btnStats");
const btnDetails = $("btnDetails");
const msg = $("msg");
const jsonBox = $("json");
const resultArea = $("result-area");
const qrcodeDisplay = $("qrcode-display");
const dashboard = $("dashboard");

// ==========================================================================
// UI LOGIC FUNCTIONS
// ==========================================================================

/**
 * Determines which URL, if any, should be pre-filled in the popup.
 * @param {object} settings - The user's saved settings.
 * @returns {Promise<{url: string|null, isShort: boolean}>}
 */
async function getInitialUrl(settings) {
  const storageData = await browser.storage.local.get(["yourls_prefill_long", "yourls_prefill_short"]);
  let url = storageData.yourls_prefill_long || storageData.yourls_prefill_short;
  let isShort = !!storageData.yourls_prefill_short;

  if (!url) {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.url && !tab.url.startsWith('about:')) {
      url = tab.url;
    }
  }

  if (url) {
    const base = H.sanitizeBaseUrl(settings.yourlsUrl);
    isShort = isShort || (base && url.startsWith(base) && url.length > base.length + 1);
  }
  return { url, isShort };
}

/**
 * Configures the UI to manage an existing short URL.
 * @param {string} url - The short URL that was detected.
 */
function handleExistingShortUrl(url) {
  resultArea.style.display = 'block';
  shortUrl.value = url;
  statsInput.value = url;
  btnDelete.disabled = false;
  longUrl.value = 'Loading...';
  longUrl.disabled = true;
  keyword.disabled = true;
  title.disabled = true;
  btnShorten.disabled = true;
  setMsg(browser.i18n.getMessage("popupInfoAutoStats"), "ok");
  btnStats.click(); // Automatically fetch stats, which will fill in the long URL.
}

/**
 * Fetches and displays the main YOURLS dashboard stats.
 */
async function showDashboard() {
  dashboard.style.display = 'block';
  dashboard.innerHTML = `<strong>${browser.i18n.getMessage("dashboardTitle")}</strong><br>Loading...`;
  const r = await browser.runtime.sendMessage({ type: "GET_DB_STATS" });
  if (r.ok) {
    const stats = r.data.stats || r.data;
    dashboard.innerHTML = `<strong>${browser.i18n.getMessage("dashboardTitle")}</strong><br>` +
    `${stats.total_links} ${browser.i18n.getMessage("dashboardLinks")} &bull; ${stats.total_clicks} ${browser.i18n.getMessage("dashboardClicks")}`;
  } else {
    dashboard.textContent = browser.i18n.getMessage("errorStatsFailed");
  }
}

/**
 * Displays the initial setup message if the add-on is not configured.
 */
function displaySetupMessage() {
  $('main-content').style.display = 'none';
  $('setup-message').style.display = 'block';
  $('btnGoToOptions').addEventListener('click', () => {
    browser.runtime.openOptionsPage();
    window.close();
  });
}

/**
 * Populates all UI elements with text from the localization files.
 */
function internationalize() {
  document.querySelectorAll('[data-i18n-key]').forEach(el => {
    const key = el.getAttribute('data-i18n-key');
    const message = browser.i18n.getMessage(key);
    if (message) {
      if (el.placeholder) el.placeholder = message;
      else el.textContent = message;
    }
  });
}

/**
 * Sets the text and style of the main status message box.
 * @param {string} text - The message to display.
 * @param {string} [cls=""] - An optional class ('ok') for styling.
 */
function setMsg(text, cls = "") {
  msg.className = "info " + cls;
  msg.textContent = text;
}

/**
 * Toggles the visibility of the raw JSON response box.
 * @param {boolean} show - Whether to show or hide the box.
 * @param {object|string} [data] - The data to display in the box.
 */
function toggleJson(show, data) {
  jsonBox.style.display = show ? "block" : "none";
  if (show && data) {
    jsonBox.textContent = typeof data === "string" ? data : JSON.stringify(data, null, 2);
  }
}

// ==========================================================================
// EVENT LISTENERS
// ==========================================================================

btnShorten.addEventListener("click", async () => {
  const url = longUrl.value.trim();
  if (!/^https?:\/\//i.test(url)) return setMsg(browser.i18n.getMessage("popupErrorInvalidUrl"));

    setMsg(browser.i18n.getMessage("popupStatusShortening"));
  toggleJson(false);

  const r = await browser.runtime.sendMessage({
    type: "SHORTEN_URL",
    longUrl: url,
    keyword: keyword.value.trim(),
                                              title: title.value.trim()
  });

  if (!r || !r.ok) return setMsg(r?.reason || browser.i18n.getMessage("errorShortenFailed"));

  resultArea.style.display = 'block';
  shortUrl.value = r.shortUrl || "";
  statsInput.value = r.shortUrl || "";
  btnDelete.disabled = !r.shortUrl;
  qrcodeDisplay.style.display = 'none';
  btnDownloadQr.style.display = 'none';

  setMsg(r.already ? browser.i18n.getMessage("popupInfoAlreadyShortened") : browser.i18n.getMessage("popupStatusCreated"), "ok");
});

btnCopyClose.addEventListener("click", () => {
  const v = shortUrl.value.trim();
  if (!v) return;
  navigator.clipboard.writeText(v).then(() => {
    window.close();
  }).catch(() => {
    setMsg(browser.i18n.getMessage("popupErrorCopyFailed"));
  });
});

btnQrCode.addEventListener("click", () => {
  const url = shortUrl.value.trim();
  if (!url) return;
  if (qrcodeDisplay.style.display === 'flex') {
    qrcodeDisplay.style.display = 'none';
    btnDownloadQr.style.display = 'none';
    return;
  }
  qrcodeDisplay.innerHTML = '';
  new QRCode(qrcodeDisplay, {
    text: url,
    width: 160,
    height: 160,
    colorDark: "#111827",
    colorLight: "#ffffff",
    correctLevel: QRCode.CorrectLevel.H
  });
  qrcodeDisplay.style.display = 'flex';
  btnDownloadQr.style.display = 'inline-block';
});

btnDownloadQr.addEventListener("click", () => {
  const url = shortUrl.value.trim();
  if (!url) return;

  // --- NEW: High-Quality Download Logic ---
  // 1. Create a temporary, hidden div to generate the large QR code.
  const tempDiv = document.createElement('div');
  tempDiv.style.display = 'none';
  document.body.appendChild(tempDiv);

  // 2. Generate a larger QR code (e.g., 512x512) in the temporary div.
  new QRCode(tempDiv, {
    text: url,
    width: 512,
    height: 512,
    colorDark: "#000000",
    colorLight: "#ffffff",
    correctLevel: QRCode.CorrectLevel.H
  });

  // 3. Get the canvas from the temporary div.
  const canvas = tempDiv.querySelector('canvas');
  if (!canvas) {
    document.body.removeChild(tempDiv); // Clean up
    return;
  }

  // 4. Create the download link from the large canvas.
  const link = document.createElement('a');
  const customKeyword = keyword.value.trim();
  const shortKeyword = shortUrl.value.split('/').pop();
  const filename = `kurl-qrcode-${customKeyword || shortKeyword || 'link'}.png`;

  link.download = filename;
  link.href = canvas.toDataURL('image/png');
  link.click();

  // 5. Remove the temporary div from the document.
  document.body.removeChild(tempDiv);
});

btnStats.addEventListener("click", async () => {
  const q = (statsInput.value || shortUrl.value).trim();
  if (!q) return setMsg(browser.i18n.getMessage("popupErrorEnterUrlForStats"));

  setMsg(browser.i18n.getMessage("popupStatusFetchingStats"));
  toggleJson(false);
  btnDetails.style.visibility = 'hidden';

  const r = await browser.runtime.sendMessage({ type: "GET_STATS", shortUrl: q });
  if (!r || !r.ok) return setMsg(r?.reason || browser.i18n.getMessage("errorStatsFailed"));

  const l = r.data?.link || r.data?.url || {};
  const message = browser.i18n.getMessage("popupStatusStatsResult", [l.shorturl || "?", l.url || "?", l.clicks ?? "?"]);
  setMsg(message, "ok");

  if (longUrl.disabled && l.url) {
    longUrl.value = l.url;
  }

  jsonBox.textContent = JSON.stringify(r.data, null, 2);
  btnDetails.style.visibility = 'visible';
});

btnDetails.addEventListener("click", () => {
  toggleJson(jsonBox.style.display !== "block");
});

btnDelete.addEventListener("click", async () => {
  const v = (statsInput.value || shortUrl.value).trim();
  if (!v) return setMsg(browser.i18n.getMessage("popupErrorProvideUrlToDelete"));

  if (!btnDelete.classList.contains('confirm-delete')) {
    btnDelete.textContent = browser.i18n.getMessage("popupBtnConfirmDelete");
    btnDelete.classList.add('confirm-delete');
    setTimeout(() => {
      btnDelete.textContent = browser.i18n.getMessage("popupBtnDelete");
      btnDelete.classList.remove('confirm-delete');
    }, 4000);
    return;
  }

  btnDelete.classList.remove('confirm-delete');
  btnDelete.textContent = browser.i18n.getMessage("popupBtnDelete");
  setMsg(browser.i18n.getMessage("popupStatusDeleting"));

  const r = await browser.runtime.sendMessage({ type: "DELETE_SHORTURL", shortUrl: v });
  if (!r || !r.ok) return setMsg(r?.reason || browser.i18n.getMessage("errorDeleteFailed"));

  setMsg(browser.i18n.getMessage("popupStatusDeleted"), "ok");
  shortUrl.value = "";
  statsInput.value = "";
  btnDelete.disabled = true;
  resultArea.style.display = 'none';
  qrcodeDisplay.style.display = 'none';
  btnDownloadQr.style.display = 'none';
});

/**
 * A final initialization function to set the default state of some UI elements.
 */
function init() {
  setMsg(browser.i18n.getMessage("popupStatusReady"));
  btnDetails.style.visibility = 'hidden';
}
