// Press-and-hold a screen point on the device, then dump collapse state.
// Usage: node scripts/device-hold.mjs <x> <y> [ms]
const [x, y, msArg] = process.argv.slice(2).map(Number);
const ms = msArg ?? 800;

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

ws.onopen = async () => {
  await send("Runtime.enable");
  await send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x, y, id: 1 }],
  });
  await new Promise((r) => setTimeout(r, ms));
  await send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await new Promise((r) => setTimeout(r, 500));

  const out = await send("Runtime.evaluate", {
    expression: `(() => { const rt = window.__unlimigent; if (!rt) return 'no hook'; const s = rt.store.getState(); const hidden = []; for (const n of Object.values(s.nodes)) { if (s.isHiddenByCollapse(n.id)) hidden.push(n.kind + ':' + n.title.slice(0, 20)); } return { collapsed: [...s.collapsedIds].map((id) => s.nodes[id]?.kind + ':' + s.nodes[id]?.title.slice(0, 20)), hiddenCount: hidden.length, hidden }; })()`,
    returnByValue: true,
  });
  console.log(JSON.stringify(out?.result?.value));
  ws.close();
  process.exit(0);
};
