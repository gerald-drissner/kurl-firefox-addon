# kURL Helper for YOURLS (optional server plugin)

This repository ships a copy of the client-neutral kURL Helper 1.1.7. It is a **YOURLS plugin** installed on the server, **not a browser add-on**. The browser never executes PHP.

## Install

1. Open `helper/kurl-helper/plugin.php` (or use the in-app Dashboard → Helper → Save plugin.php).
2. On the YOURLS server create `user/plugins/kurl-helper/` and save the file as `plugin.php` (not `plugin.php.txt`).
3. Activate **kURL Helper** in YOURLS → Manage Plugins.
4. Refresh the browser dashboard. It should report Helper 1.1.7 installed.

Only **one Helper copy** should be installed on a YOURLS server, even when several different kURL clients connect to it. Thunderbird, Chrome and Firefox extensions use the same server-side API operations. Version 1.1.6 and later are compatible with these browser clients.

The Helper adds authenticated lookup, regeneration/editing and deletion; ordinary URL shortening and statistics do not require it. Deleted or changed keywords can invalidate previously shared links.
