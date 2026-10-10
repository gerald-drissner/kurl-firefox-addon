"use strict";
const fs = require("node:fs"), path = require("node:path"), vm = require("node:vm"), assert = require("node:assert/strict");
const events = {};
const elements = new Map();
function el(id) {
  if (!elements.has(id)) elements.set(id, {
    value: "", checked: true, hidden: false, disabled: false, textContent: "", className: "",
    href: "", addEventListener(type, fn) { events[id + ":" + type] = fn; }
  });
  return elements.get(id);
}
let replyConnection, writes = [], installed = { yourlsUrl: "https://sho.rt", apiSignature: "original-token" };
const context = {
  window: {}, console, URL, Promise, setTimeout,
  document: {
    getElementById: el, documentElement: { lang: "", dir: "" },
    querySelectorAll: () => []
  },
  browser: {
    i18n: { getMessage: () => "", getUILanguage: () => "en" },
    permissions: { contains: async () => true, request: async () => true, remove: async () => true },
    storage: {local: {get: async () => ({yourlsUrl: installed.yourlsUrl}), set: async change => {
      writes.push(change); Object.assign(installed,change);
    }}, onChanged: {addListener: () => {}}},
    runtime: {sendMessage: () => new Promise(resolve => replyConnection = resolve)}
  }
};
context.window = context; context.globalThis = context;
const root = path.resolve(__dirname,"..");
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(root,"JS/helpers.js"),"utf8"),context);
vm.runInContext(fs.readFileSync(path.join(root,"JS/options.js"),"utf8"),context);
(async () => {
  // init() has to load local storage before the click handler is exercised.
  await new Promise(resolve => setTimeout(resolve,15));
  el("yourlsUrl").value = "https://sho.rt";
  el("apiSignature").value = "original-token";
  const running = events["test:click"]();
  for (let i=0; i<100 && !replyConnection; i++) await new Promise(r => setTimeout(r,1));
  assert(replyConnection,"network probe should be pending");
  el("apiSignature").value = "replacement-token";
  events["apiSignature:input"]();
  replyConnection({ok:true,total:99});
  await running;
  assert.equal(writes.length,0,"a stale response must not persist superseded credentials");
  assert.equal(installed.apiSignature,"original-token");
  assert.match(el("status").textContent,/nothing was saved/i);
  assert.equal(el("connection-indicator").className,"connection-indicator connection-neutral");
  console.log("PASS: edited settings cannot be overwritten by an in-flight successful connection check");
})().catch(error=>{console.error(error);process.exitCode=1});
