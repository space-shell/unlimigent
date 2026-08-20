// Double-tap a screen point via CDP touch events, then report camera zoom.
// Usage: node scripts/device-dbltap.mjs <x> <y>
const [x, y] = process.argv.slice(2).map(Number);

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
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg.result ?? msg.error);
    pending.delete(msg.id);
  }
};

const tap = async (tx, ty) => {
  await send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: tx, y: ty, id: 1 }] });
  await new Promise((r) => setTimeout(r, 60));
  await send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
};

ws.onopen = async () => {
  await send("Runtime.enable");
  const before = await send("Runtime.evaluate", {
    expression: "window.__unlimigent.store.getState().camera.zoom",
    returnByValue: true,
  });
  await tap(x, y);
  await new Promise((r) => setTimeout(r, 130));
  await tap(x, y);
  await new Promise((r) => setTimeout(r, 450));
  const after = await send("Runtime.evaluate", {
    expression: "(() => { const c = window.__unlimigent.store.getState().camera; const f = window.__unlimigent.store.getState().focusedNodeId; return JSON.stringify({ zoom: Math.round(c.zoom), x: Math.round(c.x), y: Math.round(c.y), focused: !!f }); })()",
    returnByValue: true,
  });
  console.log("zoom before:", Math.round(before?.result?.value));
  console.log("after:", after?.result?.value);
  ws.close();
  process.exit(0);
};
