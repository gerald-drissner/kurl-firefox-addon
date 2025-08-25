/**
 * @file helpers.js
 * @description A collection of shared utility functions used throughout the kurl extension.
 * This module is designed as an immediately-invoked function expression (IIFE)
 * to avoid polluting the global namespace.
 */

window.Helpers = (function() {
  /**
   * Cleans and validates a URL string, removing trailing slashes and whitespace.
   * Ensures a consistent format for the YOURLS instance URL.
   * @param {string} u - The URL string to sanitize.
   * @returns {string} The sanitized, validated base URL, or an empty string if invalid.
   */
  function sanitizeBaseUrl(u) {
    if (!u) return "";
    try {
      u = String(u).trim().replace(/\s+/g, "").replace(/\/+$/, "");
      const x = new URL(u);
      const path = x.pathname.replace(/\/+$/, "");
      return x.origin + path;
    } catch {
      return "";
    }
  }

  /**
   * Converts a JavaScript object into a URLSearchParams instance for API requests.
   * This is suitable for `application/x-www-form-urlencoded` POST requests.
   * @param {object} obj - The object to convert.
   * @returns {URLSearchParams}
   */
  function toFormData(obj) {
    const p = new URLSearchParams();
    Object.entries(obj || {}).forEach(([k, v]) => {
      // Append key-value pairs only if the value is not null or undefined.
      if (v !== undefined && v !== null) p.append(k, String(v));
    });
      return p;
  }

  /**
   * Retrieves user settings from local browser storage with sensible defaults.
   * @returns {Promise<{yourlsUrl: string, apiSignature: string, autoCopy: boolean}>} A promise that resolves to the settings object.
   */
  async function getSettings() {
    const o = await browser.storage.local.get({
      yourlsUrl: "",
      apiSignature: "",
      autoCopy: true
    });
    // Ensure `autoCopy` is always a strict boolean.
    return {
      yourlsUrl: o.yourlsUrl,
      apiSignature: o.apiSignature,
      autoCopy: o.autoCopy !== false
    };
  }

  /**
   * Saves a settings object to local browser storage.
   * @param {object} v - The settings object to save.
   */
  async function setSettings(v) {
    await browser.storage.local.set(v || {});
  }

  /**
   * Safely parses a string that might be JSON, returning null on failure.
   * Prevents errors from crashing the application if the API returns non-JSON text.
   * @param {string} t - The text to parse.
   * @returns {object|null} The parsed object, or null if parsing fails.
   */
  function parseMaybeJson(t) {
    try {
      return JSON.parse(t);
    } catch {
      return null;
    }
  }

  /**
   * Extracts the short URL from various possible YOURLS API response formats.
   * Provides resilience against different YOURLS versions or configurations.
   * @param {object} json - The parsed JSON response from the YOURLS API.
   * @param {string} base - The base URL of the YOURLS instance (for fallback).
   * @returns {string|null} The extracted short URL.
   */
  function extractShort(json, base) {
    if (!json) return null;
    if (json.shorturl) return json.shorturl;
    if (json.url?.shorturl) return json.url.shorturl;
    if (json.link?.shorturl) return json.link.shorturl;
    // Fallback for responses that only provide the keyword.
    if (json.keyword) return base.replace(/\/+$/, "") + "/" + json.keyword;
    return null;
  }

  /**
   * Extracts the keyword from a given string, which could be a full short URL or just the keyword itself.
   * @param {string} base - The base URL of the YOURLS instance.
   * @param {string} s - The short URL or keyword string.
   * @returns {string} The extracted keyword.
   */
  function extractKeyword(base, s) {
    if (!s) return "";
    s = String(s).trim();
    try {
      // If 's' is a full short URL from our own YOURLS instance, parse it.
      const u = new URL(s);
      if (base && u.origin === new URL(base).origin) {
        // Return the last part of the path, which is the keyword.
        return u.pathname.replace(/\/+$/, "").split("/").pop() || "";
      }
      // If it's a URL from a different domain, assume the whole string is the keyword.
      return s;
    } catch {
      // If it's not a valid URL, assume it's already a keyword.
      return s;
    }
  }

  // Expose the public functions to the `window.Helpers` object.
  return {
    sanitizeBaseUrl,
    toFormData,
    getSettings,
    setSettings,
    parseMaybeJson,
    extractShort,
    extractKeyword
  };
})();
