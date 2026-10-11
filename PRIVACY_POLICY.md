# kURL for Firefox — Privacy Policy

**Effective date:** 11 October 2026
**Applies to:** kURL – YOURLS Shortener for Firefox (add-on ID `kurl@drissner.me`), version 2.0.1 and later, until revised.
**Publisher:** Gerald Drißner (drissner.me)

## Summary

kURL talks only to the YOURLS server that you configure. It sends a URL there only when you ask kURL to shorten, look up or manage a link. The developer receives no data from kURL.

## Data kURL sends, and when

kURL connects only to the HTTPS YOURLS server whose address you enter in Settings. It sends requests to that server when you use a kURL feature:

- **Shortening** (toolbar popup, dashboard, bulk page): the URL and, if you enter them, a custom keyword and a title.
- **Right-click menu** ("kURL: Shorten and copy", "kURL: Shorten current page and copy"): the clicked link, the URL found in the selected text, or the address of the current page. Recognized Google, Bing, DuckDuckGo and YouTube redirect links are unwrapped locally to their embedded destination first; kURL never opens or follows them. The resulting short link is copied to your clipboard.
- **Lookup, statistics, editing, regenerating and deleting short links**, the dashboard overview and the connection test: the short URL, keyword or destination you enter or select, and read-only requests for link lists and statistics.

When you open the toolbar popup, kURL reads the address of the active tab (permission "activeTab", granted only when you click the kURL button) to pre-fill the URL field. It is sent to your server only when you click **Shorten**.

kURL does not read or upload page contents, cookies, form data or your browsing history.

Firefox shows these data types when you install kURL: **browsing activity** (addresses of pages you choose to shorten) and **website content** (links or selected text you choose to shorten). They are transmitted only to your own YOURLS server.

## Authentication

Your YOURLS API signature token is stored in the add-on's local storage on this device (`browser.storage.local`, not synced). kURL never sends the raw token. Each request carries a time-limited SHA-256 signature derived from the token and the current time. Requests are sent without cookies, and redirects are refused.

## Data stored on your device

- YOURLS address, API signature token and your preferences (automatic copying, success notifications).
- An activity log of at most 100 entries from the last seven days. Each entry contains only the action type (for example "Short URL created"), success or error, and the time. It contains no URLs, keywords, titles or tokens. You can view, export and clear it on the **Logs** page.

When kURL is updated from version 1.x, it deletes the last-URL prefill values that 1.x stored. Removing kURL deletes all data it stored.

## What kURL does not do

kURL contains no analytics, telemetry, advertising or tracking and does not load remote code. QR codes are generated locally. No data is sold or transferred to third parties, and no data is used for any purpose other than the features described above.

## Your YOURLS server

Your YOURLS server is operated by you or by whoever runs it. It processes, and may log, the requests kURL sends according to its own configuration and policies. The optional kURL Helper is a PHP plugin that kURL includes as a file for you to install on your YOURLS server; Firefox never executes it.

## Permissions

- **storage**: settings and the local activity log.
- **activeTab**: the address of the current tab when you invoke kURL.
- **menus**: the two right-click entries.
- **clipboardWrite**: copying the short link after a right-click.
- **notifications**: copy confirmations and error messages (success messages can be turned off in Settings).
- **Host access to your YOURLS server** (optional): granted by you in Settings for that one HTTPS address, and removable there or in the Firefox add-ons manager.

## Contact

Questions about this policy: https://github.com/gerald-drissner/kurl-firefox-addon/issues
