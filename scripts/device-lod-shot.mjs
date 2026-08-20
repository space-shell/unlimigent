// Set camera zoom via the dev hook and screenshot each LOD tier.
// Usage: node scripts/device-lod-shot.mjs
import { writeFileSync } from "node:fs";

const res = await fetch("http://localhost:9222/json");
const page = (await res.json()).find((p) => p.url.includes("localhost:5173"));
if (!page) process.exit(1);

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
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)(m.result);
    pending.delete(m.id);
  }
};

const shot = async (path) => {
  const s = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync(path, Buffer.from(s.data, "base64"));
  console.log("shot:", path);
};

ws.onopen = async () => {
  await send("Runtime.enable");
  await send("Page.enable");
  const setZoom = (z) =>
    send("Runtime.evaluate", {
      expression: `window.__unlimigent?.store.getState().setCamera({ zoom: ${z} }) ?? 'no hook'`,
      returnByValue: true,
    });

  let r = await setZoom(8);
  console.log("zoom 8:", JSON.stringify(r?.result?.value));
  await new Promise((q) => setTimeout(q, 900));
  await shot("/tmp/opencode/lod-dot.png");

  r = await setZoom(48);
  console.log("zoom 48:", JSON.stringify(r?.result?.value));
  await new Promise((q) => setTimeout(q, 900));
  await shot("/tmp/opencode/lod-full.png");

  r = await setZoom(140);
  console.log("zoom 140:", JSON.stringify(r?.result?.value));
  await new Promise((q) => setTimeout(q, 900));
  await shot("/tmp/opencode/lod-detail.png");

  ws.close();
  process.exit(0);
};
