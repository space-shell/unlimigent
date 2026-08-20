// Measure on-device canvas fps (static and while panning) via CDP:
//   node scripts/device-fps.mjs <url-substring> [panSeconds]
// Requires: adb forward tcp:9222 localabstract:chrome_devtools_remote

const [match, panArg] = process.argv.slice(2);
const panSeconds = Number(panArg ?? 2);

const res = await fetch("http://localhost:9222/json");
const pages = await res.json();
const page = pages.find((p) => p.url.includes(match ?? "localhost:5173"));
if (!page) {
  console.error("no tab matching", match);
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

const FPS_EXPR = `(seconds) => new Promise((res) => {
  let frames = 0;
  const t0 = performance.now();
  const step = () => {
    frames++;
    if (performance.now() - t0 < seconds * 1000) requestAnimationFrame(step);
    else res(Math.round(frames / seconds));
  };
  requestAnimationFrame(step);
})`;

async function pan(fromX, fromY, toX, toY, ms) {
  const steps = 12;
  await send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: fromX, y: fromY, id: 1 }],
  });
  for (let i = 1; i <= steps; i++) {
    await new Promise((r) => setTimeout(r, ms / steps));
    await send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [
        { x: fromX + ((toX - fromX) * i) / steps, y: fromY + ((toY - fromY) * i) / steps, id: 1 },
      ],
    });
  }
  await send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
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

  const staticFps = await send("Runtime.evaluate", {
    expression: `(${FPS_EXPR})(1.5)`,
    awaitPromise: true,
    returnByValue: true,
  });
  console.log("static fps:", staticFps?.result?.value);

  // fps while panning (run concurrently: start pan, then measure)
  const measure = send("Runtime.evaluate", {
    expression: `(${FPS_EXPR})(${panSeconds})`,
    awaitPromise: true,
    returnByValue: true,
  });
  await pan(900, 500, 300, 500, panSeconds * 1000);
  const panFps = await measure;
  console.log("pan fps:", panFps?.result?.value);

  ws.close();
  process.exit(0);
};

ws.onerror = () => {
  console.error("ws error");
  process.exit(1);
};
