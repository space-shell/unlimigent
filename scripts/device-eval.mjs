// Evaluate a JS expression in the attached dev tab and print the result.
// Usage: node scripts/device-eval.mjs <url-substring> <expression>
// Requires: adb forward tcp:9222 localabstract:chrome_devtools_remote

const [match, expr] = process.argv.slice(2);
if (!match || !expr) {
  console.error("usage: device-eval.mjs <url-substring> <expression>");
  process.exit(1);
}

const res = await fetch("http://localhost:9222/json");
const pages = await res.json();
const page = pages.find((p) => p.url.includes(match));
if (!page) {
  console.error("no tab matching:", match, "among", pages.map((p) => p.url));
  process.exit(1);
}
console.log("attached to:", page.url.slice(0, 80));

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
  const out = await send("Runtime.evaluate", {
    expression: expr,
    awaitPromise: true,
    returnByValue: true,
  });
  if (out?.exceptionDetails) {
    console.log("EXCEPTION:", JSON.stringify(out.exceptionDetails.exception ?? out.exceptionDetails).slice(0, 500));
  }
  console.log("result:", JSON.stringify(out?.result?.value));
  ws.close();
  process.exit(0);
};

ws.onerror = () => {
  console.error("ws error");
  process.exit(1);
};
