# kURL Firefox 2.0.1 — Review 2 handoff

11 October 2026 — **development preview only; do not merge or submit to store yet**.

This tree combines the user-reviewed 2.0.1 patch built on the prior Chrome `7c926bc` / Firefox `b45b12f` commits with the later GitHub draft-branch audit (Chrome `66c7937b`; Firefox `01e2e424`). The distributable version is still `2.0.1` and is not a store release.

## Fixes retained from both branches

- Chrome 148+ built-in `browser` namespace: `browser.menus || browser.contextMenus`, including menu registration and click handling; Firefox gracefully handles missing menus. Chrome 116–147 Logs load `JS/polyfill.js`.
- Chrome offscreen clipboard fix and unfocused-document DOM fallback, plus existing Chrome MV3 concurrent-init protection.
- Browser activity log, redirect target decoding, context-menu translations, RTL URL/date isolation, correct 128/16/32px icons, browser-specific privacy disclosures, and 1.x stored URL cleanup.
- Previous audit: reject forged Google-looking hostnames, preserve Google `/url?q=`, decode and validate Bing `a1` base64url with UTF-8, and prevent stale in-flight connection tests from overwriting settings.
- All ten locales: remove **unreferenced** Thunderbird-only legacy translation keys while retaining browser-used strings.

## Tests executed locally

- `node --check JS/*.js` for each JS file.
- Every `tests/*.cjs` script passed; explicit Chrome 148 namespace and Firefox-without-menus regressions included.
- `php -l helper/kurl-helper/plugin.php` passed; JSON manifests and referenced files checked.
- ZIP package CRC and full-source archive verified; generated patch tested with `git apply --check` against the exact source snapshot from the GitHub Draft head.
- Chromium 144 headless did not expose an extension service worker; it **does not** count as a real browser functional test. No direct Chrome 156, Firefox desktop or Firefox Android functional test performed here.

## Release gate

- Install on Chrome 156 in a separate profile; check 1.x update and permissions prompt, retained YOURLS connection, current-page popup, context copy after service-worker idle and user interaction, Helper functions, and Logs.
- Install on Firefox 157 and ESR 140 in separate profiles; test right-click copy and return from idle, URLs in RTL locales and permissions.
- Re-run Chrome Web Store validation and AMO lint/review. Mozilla's lint findings and real browser findings reported in the incoming user review have **not** been independently reproduced here.
- Keep existing Chrome Web Store item ID; do not publish to a new listing. Update store listing: this add-on unwraps recognized redirect links, but does **not** generically strip `utm_` tracking parameters.
- Evaluate Chrome mandatory `clipboardWrite`: updating from the existing store version may cause disable-and-reenable until permission acceptance. It remains mandatory in these functional-test builds, not a release decision. Firefox `data_collection_permissions` remains as supplied by the user for now; verify impact on existing users.

## GitHub state

The merged Review2 tree is committed on the two existing **Draft PR branches**: Chrome `f71c298ac55199c092dba3797544d5c19b7e1026` and Firefox `acc8b5db0b9f9c887cd4441cb2e8cccaeef85684`. GitHub Actions CI passed on **Linux, Windows and macOS** for both commits. The two `main` branches, store listings, WordPress and Thunderbird are unchanged.

**Do not apply either the original 2.0.1 review patch or the Review2-on-current-branch patch again:** all the reviewed changes are already included in these Draft branches. Keep both PRs in Draft until the live browser and store checks in the release gate are completed.

WordPress and Thunderbird code are not modified. The shared Helper PHP plugin is included only as a **static, unchanged copy**.
