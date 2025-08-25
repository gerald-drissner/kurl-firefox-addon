/**
 * kurl - background.js
 * This script is the central hub for the kurl extension. It handles all
 * communication with the YOURLS API, manages browser-level interactions like
 * context menus and the toolbar icon, and listens for requests from the popup.
 *
 * version: 1.1 (Final)
 */

const H = window.Helpers;

/**
 * A list of known tracking/redirect URL patterns to clean before shortening.
 * This makes the add-on more user-friendly by shortening the true destination URL.
 * Each pattern object defines how to identify and parse a specific redirect service.
 */
const REDIRECT_PATTERNS = [
  {
    // Google Search, Images, etc.
    host_prefix: 'www.google.',
    path: '/url',
    param: 'url'
  },
{
  // Bing Search
  host_prefix: 'www.bing.com',
  path: '/ck/a',
  param: 'u',
  prefix_to_strip: 'a1' // Bing adds a prefix to the URL parameter
},
{
  // DuckDuckGo Search
  host_prefix: 'duckduckgo.com',
  path: '/l/',
  param: 'uddg'
},
{
  // YouTube redirect links (e.g., in video descriptions)
  host_prefix: 'www.youtube.com',
  path: '/redirect',
  param: 'q'
}
];

// ==========================================================================
// API ACTION IMPLEMENTATIONS
// These functions communicate directly with the YOURLS API.
// ==========================================================================

/**
 * Fetches the main database statistics (total links, total clicks).
 * @returns {Promise<object>} The stats JSON data.
 */
async function apiDbStats() {
  const { yourlsUrl, apiSignature } = await H.getSettings();
  const base = H.sanitizeBaseUrl(yourlsUrl);
  const { res, json } = await yourlsFetch(base, { action: "stats", format: "json", signature: apiSignature });

  if (!res.ok || !json) {
    throw new Error(browser.i18n.getMessage("errorStatsFailed"));
  }
  return json;
}

/**
 * Fetches detailed statistics for a single short URL.
 * @param {string} shortOrKeyword - The short URL or keyword to look up.
 * @returns {Promise<object>} The stats JSON data for the specified link.
 */
async function apiStats(shortOrKeyword) {
  const { yourlsUrl, apiSignature } = await H.getSettings();
  const base = H.sanitizeBaseUrl(yourlsUrl);
  const kw = H.extractKeyword(base, shortOrKeyword);
  const { res, text, json } = await yourlsFetch(base, { action: "url-stats", format: "json", signature: apiSignature, shorturl: kw });

  if (!res.ok) {
    if (res.status === 404) {
      throw new Error(browser.i18n.getMessage("popupErrorStatsNotFound"));
    }
    throw new Error(`HTTP ${res.status}${text ? ": " + text.slice(0, 100) : ""}`);
  }
  return json;
}

/**
 * Creates a new short URL.
 * @param {string} longUrl - The URL to shorten.
 * @param {string} keyword - An optional custom keyword.
 * @param {string} title - An optional custom title for the link.
 * @returns {Promise<object>} An object containing the result of the shorten request.
 */
async function apiShorten(longUrl, keyword, title) {
  const { yourlsUrl, apiSignature } = await H.getSettings();
  const base = H.sanitizeBaseUrl(yourlsUrl);
  if (!base || !apiSignature) throw new Error(browser.i18n.getMessage("errorNoSettings"));

  const payload = { action: "shorturl", format: "json", signature: apiSignature, url: longUrl };
  if (keyword) payload.keyword = keyword;
  if (title) payload.title = title;

  const { res, text, json } = await yourlsFetch(base, payload);

  // Gracefully handle the case where the URL already exists.
  if (json && /already exists/i.test(String(json.message || ""))) {
    let existingShortUrl = null;
    const match = String(json.message).match(/\(short URL: (https?:\/\/\S+)\)/i);
    if (match && match[1]) {
      existingShortUrl = match[1];
    } else {
      existingShortUrl = H.extractShort(json, base);
    }
    toast(browser.i18n.getMessage("extensionName"), browser.i18n.getMessage("toastUrlExists"));
    return { ok: true, shortUrl: existingShortUrl, already: true };
  }

  const short = H.extractShort(json, base);
  if (res.ok && json && short) {
    toast(browser.i18n.getMessage("extensionName"), browser.i18n.getMessage("toastUrlCreated"));
    return { ok: true, shortUrl: short, already: false };
  }

  // Handle other API errors.
  if (json?.status === "fail" && json.message) throw new Error(json.message);
  throw new Error(`HTTP ${res.status}${text ? (": " + text.slice(0, 200)) : ""}`);
}

/**
 * Deletes an existing short URL.
 * @param {string} shortOrKeyword - The short URL or keyword to delete.
 * @returns {Promise<object>} An object indicating success or failure.
 */
async function apiDelete(shortOrKeyword) {
  const { yourlsUrl, apiSignature } = await H.getSettings();
  const base = H.sanitizeBaseUrl(yourlsUrl);
  const keyword = H.extractKeyword(base, shortOrKeyword);
  if (!keyword) throw new Error(browser.i18n.getMessage("errorEnterKeywordToDelete"));

  const payload = { action: "delete", format: "json", signature: apiSignature, shorturl: keyword };
  const { res, json } = await yourlsFetch(base, payload);

  const isSuccess = (j) => j && (j.status === "success" || /success.*deleted/i.test(j.message || "") || j.statusCode === 200);

  if (res.ok && isSuccess(json)) {
    toast(browser.i18n.getMessage("extensionName"), browser.i18n.getMessage("toastUrlDeleted"));
    return { ok: true };
  }

  const errorDetails = json?.message || json?.error || "";
  throw new Error(`Delete failed: HTTP ${res.status} ${errorDetails ? `- ${errorDetails}` : ''}`);
}

/**
 * Checks the connection to the YOURLS API (used in the options page).
 * @returns {Promise<object>} An object with connection status and total link count.
 */
async function apiCheck() {
  const { yourlsUrl, apiSignature } = await H.getSettings();
  const base = H.sanitizeBaseUrl(yourlsUrl);
  if (!base || !apiSignature) {
    return { ok: false, reason: browser.i18n.getMessage("errorNoSettings") };
  }
  try {
    const { res, json } = await yourlsFetch(base, { action: "stats", format: "json", signature: apiSignature });
    if (res.ok && json) {
      const total = (json.total_links ?? json.stats?.total_links ?? "?");
      return { ok: true, total };
    }
  } catch (e) {
    return { ok: false, reason: String(e?.message || e) };
  }
  return { ok: false, reason: browser.i18n.getMessage("optionsStatusConnFailed") };
}


// ==========================================================================
// ADD-ON INTEGRATION & EVENT LISTENERS
// These functions connect the API logic to the browser UI.
// ==========================================================================

/**
 * Intelligently determines which URL to shorten based on the user's action.
 * It cleans known tracking/redirect links to get the true destination URL.
 * @param {object} [info] - The context menu info object, if the action originated from a context menu.
 * @param {object} [tab] - The active tab object.
 * @returns {Promise<string>} The clean URL to be shortened.
 */
async function getUrlForAction(info, tab) {
  // 1. Prioritize a link from a context menu click.
  if (info && info.linkUrl) {
    let link = info.linkUrl;

    // Clean the link using the REDIRECT_PATTERNS list.
    try {
      const urlObject = new URL(link);
      for (const pattern of REDIRECT_PATTERNS) {
        if (urlObject.hostname.startsWith(pattern.host_prefix) && urlObject.pathname.startsWith(pattern.path)) {
          let realUrl = urlObject.searchParams.get(pattern.param);
          if (realUrl) {
            if (pattern.prefix_to_strip && realUrl.startsWith(pattern.prefix_to_strip)) {
              realUrl = realUrl.substring(pattern.prefix_to_strip.length);
            }
            link = realUrl;
            break; // Pattern matched, no need to check others.
          }
        }
      }
    } catch (e) {
      console.warn("Could not parse link for cleaning, falling back.", e);
    }
    return link;
  }

  // 2. Fall back to selected text, trying to find a URL within it.
  if (info && info.selectionText) {
    const match = info.selectionText.match(/https?:\/\/\S+/);
    if (match) return match[0];
  }

  // 3. Finally, use the active tab's URL (for toolbar clicks or page context menu).
  if (tab && tab.url && !tab.url.startsWith('about:')) {
    return tab.url;
  }

  return '';
}

/**
 * The main handler for all user entry points (toolbar icon, context menu).
 * It determines the correct URL, passes it to the popup, and opens the popup.
 * @param {object} tab - The tab where the action was triggered.
 * @param {object} [info] - Optional context menu data.
 */
async function handleAction(tab, info) {
  // Open the popup immediately to ensure the browser honors the user action.
  browser.action.openPopup();

  // Then, determine and store the URL for the popup to use when it loads.
  const urlToShorten = await getUrlForAction(info, tab);
  await browser.storage.local.remove(["yourls_prefill_long", "yourls_prefill_short"]);

  if (urlToShorten) {
    const { yourlsUrl } = await H.getSettings();
    const base = H.sanitizeBaseUrl(yourlsUrl);
    // Differentiate between a long URL to shorten and an existing short URL to manage.
    if (base && urlToShorten.startsWith(base)) {
      await browser.storage.local.set({ yourls_prefill_short: urlToShorten });
    } else {
      await browser.storage.local.set({ yourls_prefill_long: urlToShorten });
    }
  }
}

/**
 * Central message hub that listens for requests from other parts of the extension (like the popup).
 */
browser.runtime.onMessage.addListener(async (msg) => {
  try {
    switch (msg.type) {
      case "CHECK_CONNECTION": return await apiCheck();
      case "SHORTEN_URL": return await apiShorten(msg.longUrl, msg.keyword || "", msg.title || "");
      case "GET_STATS": return { ok: true, data: await apiStats(msg.shortUrl) };
      case "DELETE_SHORTURL": return await apiDelete(msg.shortUrl);
      case "GET_DB_STATS": return { ok: true, data: await apiDbStats() };
      default: return { ok: false, reason: "Unknown message type" };
    }
  } catch (e) {
    const message = String(e?.message || e);
    // Provide more user-friendly error messages for common API responses.
    if (/keyword.*already exists/i.test(message)) {
      return { ok: false, reason: browser.i18n.getMessage("errorKeywordExists") };
    }
    return { ok: false, reason: message };
  }
});

// Listen for clicks on the main toolbar icon.
browser.action.onClicked.addListener(handleAction);

// Listen for clicks on any of our context menu items.
browser.menus.onClicked.addListener((info, tab) => {
  handleAction(tab, info);
});


// ==========================================================================
// SETUP & UTILITY FUNCTIONS
// ==========================================================================

/**
 * Creates the right-click context menu items when the extension is installed or started.
 */
function setupMenus() {
  browser.menus.removeAll(() => {
    browser.menus.create({
      id: "yourls-shorten-page",
      title: browser.i18n.getMessage("menuItemShortenPage"),
                         contexts: ["page"]
    });
    browser.menus.create({
      id: "yourls-shorten-selection",
      title: browser.i18n.getMessage("menuItemShortenSelection"),
                         contexts: ["selection"]
    });
    browser.menus.create({
      id: "yourls-shorten-link",
      title: browser.i18n.getMessage("menuItemShortenLink"),
                         contexts: ["link"]
    });
  });
}

/**
 * Shows a brief, non-intrusive browser notification.
 * @param {string} title - The title of the notification.
 * @param {string} message - The body text of the notification.
 */
function toast(title, message) {
  browser.notifications.create({
    type: "basic",
    title,
    message,
    iconUrl: "images/kurl-icon-48.png"
  });
}

/**
 * A generic, reusable fetch wrapper for making requests to the YOURLS API.
 * It handles permissions, headers, and response parsing.
 * @param {string} baseUrl - The base URL of the YOURLS instance.
 * @param {object} payload - The API parameters to be sent in the request body.
 * @returns {Promise<{res: Response, text: string, json: object|null}>}
 */
async function yourlsFetch(baseUrl, payload) {
  const origin = new URL(baseUrl).origin;
  // Ensure we have permission to contact the host before making the request.
  if (!(await browser.permissions.contains({ origins: [`${origin}/*`] }))) {
    throw new Error("Host permission was not granted.");
  }
  const endpoint = `${baseUrl}/yourls-api.php`;
  const params = H.toFormData(payload);

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
      "Accept": "application/json"
    },
    body: params
  });

  const text = await res.text().catch(() => "");
  return { res, text, json: H.parseMaybeJson(text) };
}

// Initialize the extension's context menus on install or browser startup.
browser.runtime.onInstalled.addListener(setupMenus);
browser.runtime.onStartup.addListener(setupMenus);
