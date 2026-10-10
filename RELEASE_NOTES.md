# kURL Firefox 2.0.0 — development preview

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
