// Tap a screen point on the device and report the resulting focus + camera.
// Usage: node scripts/device-tap.mjs <x> <y>
// Requires: adb forward tcp:9222 localabstract:chrome_devtools_remote

const [x, y] = process.argv.slice(2).map(Number);
if (!x || !y) {
  console.error("usage: device-tap.mjs <x> <y>");
  process.exit(1);
}

const res = await fetch("http://localhost:9222/json");
const pages = await res.json();
const page = pages.find((p) => p.url.includes("localhost:5173"));
if (!page) {
  console.error("no dev tab");
  process.exit(1);
}

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
  await send("Runtime.enable");

  // instrument the DOM-free check: read focus from the info bar text
  const before = await send("Runtime.evaluate", {
    expression: "document.querySelector('.info-bar')?.textContent",
    returnByValue: true,
  });
  console.log("before:", before?.result?.value?.trim().slice(0, 120));

  await send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x, y, id: 1 }],
  });
  await new Promise((r) => setTimeout(r, 80));
  await send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });

  await new Promise((r) => setTimeout(r, 400));
  const after = await send("Runtime.evaluate", {
    expression: "document.querySelector('.info-bar')?.textContent",
    returnByValue: true,
  });
  console.log("after: ", after?.result?.value?.trim().slice(0, 120));

  ws.close();
  process.exit(0);
};

ws.onerror = () => {
  console.error("ws error");
  process.exit(1);
};
