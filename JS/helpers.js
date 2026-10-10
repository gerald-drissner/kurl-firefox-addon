/* Shared input validation and YOURLS response helpers. */
globalThis.Helpers = (() => {
  "use strict";

  function sanitizeBaseUrl(input) {
    try {
      const raw = String(input || "").trim();
      if (!raw || /\s/.test(raw)) return "";
      const url = new URL(raw);
      if (url.protocol !== "https:" || url.username || url.password ||
          url.search || url.hash) return "";
      let path = url.pathname.replace(/\/+$/, "");
      path = path.replace(/\/yourls-api\.php$/i, "").replace(/\/admin$/i, "");
      return url.origin + path;
    } catch {
      return "";
    }
  }

  function validHttpUrl(input) {
    try {
      const raw = String(input || "").trim();
      if (!raw || /[\s\\]/.test(raw) || raw.length > 8192) return "";
      const url = new URL(raw);
      if (!["https:", "http:"].includes(url.protocol) || !url.hostname ||
          url.username || url.password) return "";
      return raw;
    } catch {
      return "";
    }
  }

  function validKeyword(value) {
    const keyword = String(value || "").trim();
    return /^[A-Za-z0-9_-]{1,100}$/.test(keyword) ? keyword : "";
  }

  function extractKeyword(base, input) {
    const str = String(input || "").trim();
    if (!str) return "";
    if (!/^https?:\/\//i.test(str)) return validKeyword(str);
    try {
      const server = new URL(sanitizeBaseUrl(base) + "/");
      const candidate = new URL(str);
      if (candidate.origin !== server.origin || candidate.search || candidate.hash ||
          !candidate.pathname.startsWith(server.pathname)) return "";
      const tail = candidate.pathname.slice(server.pathname.length);
      if (!tail || tail.includes("/") || /%/.test(tail)) return "";
      return validKeyword(tail);
    } catch {
      return "";
    }
  }

  // Lookup accepts alternate spellings of short URLs from this server. This
  // intentionally does NOT change extractKeyword(), which validates canonical
  // URLs for write operations (edit, regenerate, delete).
  function classifyLookupInput(base, input) {
    const serverBase = sanitizeBaseUrl(base);
    const raw = String(input || "").trim();
    if (!serverBase || !raw) return null;
    const keyword = validKeyword(raw);
    if (keyword) return { kind: "short", shortUrl: serverBase + "/" + keyword };

    const hasScheme = /^https?:\/\//i.test(raw);
    const schemelessHost = !hasScheme && /^[^\s/?#]+\.[^\s/?#]+(?:[/?#]|$)/.test(raw);
    const candidate = schemelessHost ? "https://" + raw : raw;
    const urlText = validHttpUrl(candidate);
    if (!urlText) return null;
    const parsed = new URL(urlText);
    const server = new URL(serverBase);
    if (parsed.hostname.toLowerCase() !== server.hostname.toLowerCase()) {
      // Never present a schemeless foreign URL as an arbitrary destination.
      return hasScheme ? { kind: "long", target: urlText } : null;
    }
    // Only the configured YOURLS path is reserved for short URLs. When YOURLS
    // lives in a subfolder, a different page on the same website is a normal
    // destination URL, not an invalid short link. Scheme-less destinations are
    // still refused because they are ambiguous without an explicit scheme.
    const rootPath = server.pathname.replace(/\/+$/, "") + "/";
    if (parsed.port !== server.port) return { kind: "own-invalid" };
    if (rootPath !== "/" && parsed.pathname !== rootPath.slice(0, -1) &&
        !parsed.pathname.startsWith(rootPath))
      return hasScheme ? { kind: "long", target: urlText } : null;
    // The short-link namespace itself must not be shortened a second time.
    if (!parsed.pathname.startsWith(rootPath)) return { kind: "own-invalid" };
    const slug = parsed.pathname.slice(rootPath.length).replace(/\/+$/, "");
    const ownKeyword = validKeyword(slug);
    if (!ownKeyword) return { kind: "own-invalid" };
    // Ignore a trailing slash, query string and fragment when looking up an
    // already shortened link. The request uses the canonical HTTPS URL.
    return { kind: "short", shortUrl: serverBase + "/" + ownKeyword };
  }

  function extractShort(json, base) {
    const candidates = [json?.shorturl, json?.url?.shorturl, json?.link?.shorturl];
    for (const candidate of candidates) {
      const url = validHttpUrl(candidate);
      if (url && extractKeyword(base, url)) return url;
    }
    const keyword = validKeyword(json?.keyword);
    return keyword && sanitizeBaseUrl(base)
      ? sanitizeBaseUrl(base) + "/" + keyword : null;
  }

  function toFormData(obj) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(obj || {})) {
      if (value !== undefined && value !== null) params.append(key, String(value));
    }
    return params;
  }

  async function getSettings() {
    const data = await browser.storage.local.get({
      yourlsUrl: "", apiSignature: "", autoCopy: true, showCopyNotifications: true
    });
    return {
      yourlsUrl: sanitizeBaseUrl(data.yourlsUrl),
      apiSignature: String(data.apiSignature || ""),
      autoCopy: data.autoCopy !== false,
      showCopyNotifications: data.showCopyNotifications !== false
    };
  }

  async function setSettings(values) {
    return browser.storage.local.set(values);
  }

  function parseMaybeJson(text) {
    try {
      const obj = JSON.parse(text);
      return obj && typeof obj === "object" ? obj : null;
    } catch {
      return null;
    }
  }

  return {
    sanitizeBaseUrl, validHttpUrl, validKeyword, extractKeyword, classifyLookupInput, extractShort,
    toFormData, getSettings, setSettings, parseMaybeJson
  };
})();