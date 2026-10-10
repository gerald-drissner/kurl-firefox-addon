# Browser testing checklist

1. Update over the existing extension and check that YOURLS host/token settings remain intact.
2. Test an empty profile: dashboard onboarding, direct Settings and Test connection & save.
3. Test short URL, keyword and destination lookup, also HTTP/HTTPS reverse proxy URLs and subfolder installations.
4. Use a throwaway short URL to test create, copy, edit, regenerate and delete (cancel and confirm).
5. Test context-menu on a page, on a link and on selected text; check clipboard contents and notifications on/off.
6. Test QR generation and local PNG download; bulk URL shortening and the seven-day activity log export.
7. Test Arabic/Hebrew RTL switches and verify all UI controls remain usable.
8. Chrome: explicitly test clipboard copying from a service worker through the offscreen document and verify the service worker recovers after suspension. Firefox: test background clipboard behavior.
9. Verify optional host permissions only grant access to the chosen HTTPS YOURLS server.
10. Run Firefox AMO / Chrome Web Store validators before production submission and do not claim native-browser testing when only mocked API checks passed.
