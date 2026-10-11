## 2.0.2 — Dashboard version, contact and voluntary support

- The dashboard now shows the installed kURL version dynamically from the extension manifest.
- Added localized Contact and optional Support development links. External links open only after an explicit click; all features remain free.
- No new permissions or changes to YOURLS authentication, the optional server-side Helper or browser data handling.

The 2.0.1 and 2.0.0 changes below remain included in 2.0.2.

# kURL Firefox 2.0.1 — development preview

Fixes after review of the 2.0.0 preview:

- The activity log again records created, deleted, looked-up, edited and regenerated links (type and status only, never URLs), as in Thunderbird.
- Bing redirect links are decoded (base64url after `a1`), and Google `/url?q=` links are unwrapped.
- Chrome-only offscreen code was removed from the Firefox background (two addons-linter warnings).
- The background starts without a `menus` API (prerequisite for Firefox for Android).
- `tabs` permission removed (`activeTab` is sufficient); `data_collection_permissions` declared; 16, 32 and 128 px icons added.
- URLs and dates keep left-to-right order in Arabic and Hebrew. Untranslated context-menu entries and Thunderbird-specific wording were corrected; the popup no longer replaces "URL already shortened." with the copy confirmation.
- The Helper source link points to an immutable commit; legacy 1.x prefill values are deleted on update; browser-accurate privacy policy.

## 2.0.0

This major rewrite brings the Thunderbird kURL 2.0.20 dashboard and security model to Firefox, while retaining browser-native toolbar and context-menu behavior.

- Complete YOURLS dashboard with most-clicked and recent links, link counts and click statistics.
- Two-way lookup of short URLs and their destinations using the optional YOURLS Helper.
- Create, inspect, copy, update, regenerate and safely delete links, with confirmation.
- Browser toolbar popup for the active page, custom keywords/titles, click statistics and locally generated QR images.
- Context-menu shortening and copying of selected URLs, links or the current page.
- Bulk URL processing and bounded local activity log with pagination and TXT export.
- HTTPS-only YOURLS connection with short-lived SHA-256 API signatures and test-before-save setup.
- Configurable copy confirmations and localized error messages; RTL layout improvements.

**No automatic update of store listings**: this is a development preview awaiting full browser GUI tests and store validation. A configured YOURLS server and API token are required. Advanced editing and deletion require optional kURL Helper 1.1.6+ installed on the YOURLS server.
