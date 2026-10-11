# kURL for Firefox — 2.0.1 development preview

This is a **separate browser extension**, modernized using the tested kURL for Thunderbird 2.0.20 dashboard, security model, YOURLS API client, link search, bulk shortening and local logs. **Do not submit this preview to the store without live browser tests.**

## Features
- Full dashboard: two-way lookup (keyword/short URL → target and clicks; destination → existing short link via the optional server-side Helper), top and recent links, create and safely edit/delete links.
- Configurable HTTPS YOURLS connection with time-limited SHA-256 signatures, test-and-save setup, connection status and local optional notifications.
- Browser toolbar popup shortens the active page, allows custom keywords/titles, copying, link statistics and locally rendered/downloadable QR codes.
- Browser context menu shortens a selected URL, linked URL or current page and copies the result. It also preserves the earlier browser feature of unwrapping recognized Google, Bing, DuckDuckGo and YouTube redirect links when their embedded destination is a valid HTTP(S) URL. In Firefox the background page writes to the clipboard directly (permission `clipboardWrite`).
- Bulk shortening, local activity log (7 days/100 records) with TXT export, 10 locale directories, and RTL layouts.
- Optional YOURLS Helper 1.1.7 is provided as static PHP source to install on the user's YOURLS server. It is not executed in the browser.

## Upgrading
The existing Firefox extension ID `kurl@drissner.me` is preserved. Connection settings `yourlsUrl`, `apiSignature` and `autoCopy` use the same storage keys as the old version. Re-test the connection after updating YOURLS, because API signatures may change. A saved `http://` YOURLS address from 1.x is offered as `https://` in Settings; HTTP is no longer supported.

2.x no longer requests `tabs`; the current page is read through `activeTab` when you click the kURL button. The manifest declares `data_collection_permissions` (`browsingActivity`, `websiteContent`): URLs, links or selected text you choose to shorten are sent to your own YOURLS server. AMO does not yet require this declaration for add-ons created before 3 November 2025, but Firefox shows it at install and when it is added in an update.

Firefox for Android has no `menus` API. The background script runs without it (`tests/no-menus.cjs`); before marking the add-on Android-compatible on AMO, test the popup and dashboard on Firefox for Android 142 or later.

## Security notes
All API access is via HTTPS; raw signature tokens stay in local browser extension storage. The code rejects redirects and overlarge responses. User-selected host permissions are granted only after explicit setup. Clipboard/QR operations do not use third-party services. Do not claim full translations in all 10 languages; untranslated keys may fall back to English.

## Differences from Thunderbird
Thunderbird's message-reading, compose-editor insertion, QR attachment, `compose` and `messagesRead` APIs are *not* included. Browser page/link selection and copy replace them. The Chrome MV3 background is a service worker; Firefox uses background scripts.

## Local development
Run `node --check JS/*.js` file by file and execute all `node tests/*.cjs` scripts listed in `.github/workflows/ci.yml`. For Chrome, load the folder through `chrome://extensions` → Developer mode → Load unpacked. For Firefox, test as a temporary add-on through `about:debugging` → This Firefox → Load Temporary Add-on → select `manifest.json`.

Audit follow-up: safe Bing base64url link unwrapping, Google-host spoofing rejection and protection against overwriting settings edited during a connection test.
