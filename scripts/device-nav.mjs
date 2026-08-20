// Navigate the attached dev tab and optionally screenshot it.
// Usage: node scripts/device-nav.mjs <url> [waitMs] [screenshot.png]
// Requires: adb forward tcp:9222 localabstract:chrome_devtools_remote

const [url, waitArg, shotPath] = process.argv.slice(2);
if (!url) {
  console.error("usage: device-nav.mjs <url> [waitMs] [screenshot.png]");
  process.exit(1);
}
const waitMs = Number(waitArg ?? 3000);

const res = await fetch("http://localhost:9222/json");
const pages = await res.json();
const page = pages.find((p) => p.url.includes("localhost:5173")) ?? pages[0];
console.log("attached to:", page.title, page.url.slice(0, 80));

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
    pending.get(msg.id)(msg.result ?? msg.error);
    pending.delete(msg.id);
  }
};

ws.onopen = async () => {
  await send("Page.enable");
  const nav = await send("Page.navigate", { url });
  console.log("navigate ->", JSON.stringify(nav));
  await new Promise((r) => setTimeout(r, waitMs));
  if (shotPath) {
    const shot = await send("Page.captureScreenshot", { format: "png" });
    if (shot?.data) {
      const { writeFileSync } = await import("node:fs");
      writeFileSync(shotPath, Buffer.from(shot.data, "base64"));
      console.log("screenshot ->", shotPath);
    } else {
      console.log("screenshot failed:", JSON.stringify(shot).slice(0, 200));
    }
  }
  ws.close();
  process.exit(0);
};

ws.onerror = () => {
  console.error("ws error");
  process.exit(1);
};
