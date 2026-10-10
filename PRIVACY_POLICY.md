# kURL for Firefox — Privacy Policy (for ATN submission)

**Effective date:** 10 October 2026  
**Publisher:** Gerald Drißner  
**Applies to:** kURL for Firefox, version 2.0.20 and later, until revised.

kURL communicates only with the HTTPS YOURLS server you configure. When you explicitly shorten or manage a link, it sends the original URL and, where provided, a custom keyword and title to that server. The dashboard requests short-link statistics and metadata from that server. These requests are necessary for the add-on to work.

Your YOURLS API signature token and preferences are stored locally in your browser extension storage. kURL uses the token to compute a short-lived SHA-256 API signature; it does not send the raw token with requests. Your configured server receives API requests and may log them according to its operator's policies. The developer of kURL does not receive these requests unless you independently configure a server they operate.

kURL can access the current selection and compose window to shorten or insert a link at your request. It does not upload your webpage contents unrelated to the selected link to the developer. QR codes are generated locally, without a third-party QR service.

A small local activity log records action types, result status and timestamps for up to seven days (maximum 100 entries). This log does not store URLs, message contents or the API token. You can view, export or clear it within the extension. Success notifications can be disabled in settings.

kURL contains a standalone optional YOURLS Helper PHP file for users to copy or save. The browser does not execute that file. If you install it on your own YOURLS server, your server handles the resulting API actions.

kURL does not contain advertising, analytics, third-party tracking or telemetry and does not sell user information. No information is transmitted to the developer by the add-on itself. To delete locally saved kURL preferences and logs, remove them through the add-on where available or uninstall kURL and clear its extension storage through Thunderbird as appropriate.

**External services:** The chosen YOURLS server is under the user's control. Links opened by the user, such as GitHub source documentation, are subject to the destination website's privacy policy. The extension never loads third-party JavaScript at runtime.

For privacy questions, use the project's GitHub issue tracker: https://github.com/gerald-drissner/kurl-thunderbird-addon/issues

## Short description for the Thunderbird Add-ons listing

kURL sends the URLs you choose to shorten or manage, and optional keywords/titles, only to your configured HTTPS YOURLS server. It keeps your API token and a limited activity log locally in your browser. It does not collect analytics or send your emails to the add-on developer.

*This complete text must be entered in the ATN privacy-policy field by the add-on owner.*
