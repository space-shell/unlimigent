// Remote console capture via adb-forwarded DevTools protocol.
// Usage: node scripts/device-console.mjs [seconds]
// Requires: adb forward tcp:9222 localabstract:chrome_devtools_remote

const seconds = Number(process.argv[2] ?? 8);

const res = await fetch("http://localhost:9222/json");
const pages = await res.json();
const page = pages.find((p) => p.url.includes("localhost:5173"));
if (!page) {
  console.error("no dev-server tab found among:", pages.map((p) => p.url));
  process.exit(1);
}
console.log("attached to:", page.title, page.url);

const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
function send(method, params = {}) {
  return new Promise((resolve) => {
    const mid = ++id;
    pending.set(mid, resolve);
    ws.send(JSON.stringify({ id: mid, method, params }));
  });
}

ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg.result);
    pending.delete(msg.id);
    return;
  }
  if (msg.method === "Runtime.consoleAPICalled") {
    const { type, args } = msg.params;
    const text = args.map((a) => a.value ?? a.description ?? a.type).join(" ");
    console.log(`[console.${type}] ${text.slice(0, 800)}`);
  } else if (msg.method === "Runtime.exceptionThrown") {
    const d = msg.params.exceptionDetails;
    const text = d.exception?.description ?? d.text;
    console.log(`[exception] ${String(text).slice(0, 1200)}`);
  } else if (msg.method === "Log.entryAdded") {
    const e = msg.params.entry;
    console.log(`[log.${e.level}] ${e.source}: ${e.text}`.slice(0, 800));
  } else if (msg.method === "Page.loadEventFired") {
    console.log("[page] load fired");
  }
};

ws.onopen = async () => {
  console.log(`listening for ${seconds}s (reloading page)...`);
  await send("Runtime.enable");
  await send("Log.enable");
  await send("Page.enable");
  await send("Page.reload", { ignoreCache: true });
  setTimeout(async () => {
    ws.close();
    console.log("done");
    process.exit(0);
  }, seconds * 1000);
};

ws.onerror = (e) => {
  console.error("ws error:", e.message ?? e);
  process.exit(1);
};
