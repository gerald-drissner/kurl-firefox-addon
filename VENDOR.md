# Third-party library declaration

## QR Code Generator (`qrcode-generator`)

- Package: `qrcode-generator`
- Published version: **2.0.4** (npm)
- Author: Kazuhiko Arase
- License: MIT
- Bundled file: `JS/qrcode.js` (**unmodified**) 
- Published package: https://www.npmjs.com/package/qrcode-generator/v/2.0.4
- Versioned npm CDN distribution (reference only; never loaded remotely): https://cdn.jsdelivr.net/npm/qrcode-generator@2.0.4/dist/qrcode.js
- Upstream release tag: https://github.com/kazuhikoarase/qrcode-generator/releases/tag/js2.0.4
- Upstream source repository, package version `2.0.4`, commit `83b7e8fe3fddd3b0368dbafd6ce56995bd25e3c8`:
  https://raw.githubusercontent.com/kazuhikoarase/qrcode-generator/83b7e8fe3fddd3b0368dbafd6ce56995bd25e3c8/js/dist/qrcode.js
- Git blob SHA-1 (unmodified source): `df13f829bf41f36b82f0ed85751ed3b4c39cfeb8`
- SHA-256 of bundled file: `79ec86f82856005b1c887905cfccfcfbec3821ca61c7fd5a952faa5f778f791c`

Our QR drawing code lives in `JS/popup.js`, not in the vendored library. The library is bundled locally; the add-on does **not** load remote scripts.

