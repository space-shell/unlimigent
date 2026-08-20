// Spike 0a: enumerate the @getpaseo/client event/API surface against a live
// daemon. Findings go to MVP.md (spike findings log).
//
// Usage:
//   PASEO_URL=ws://host:6767/ws [PASEO_PASSWORD=...] npm run spike:0a
//
// Prints: client surface (namespaces + methods), results of safe list calls,
// and observed socket events. Read-only: creates nothing.

import { createPaseoClient } from "@getpaseo/client";

const url = process.env.PASEO_URL ?? "ws://127.0.0.1:6767/ws";
const password = process.env.PASEO_PASSWORD;
const timeoutMs = 15000;

const log = (...args) => console.log("[spike-0a]", ...args);
const bail = (msg) => {
  console.error("[spike-0a]", msg);
  process.exit(1);
};

function surface(obj, label, depth = 1) {
  if (obj === null || typeof obj !== "object") return;
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === "function") {
      log(`${label}.${key}()`);
    } else if (value !== null && typeof value === "object" && depth > 0) {
      log(`${label}.${key} {`);
      surface(value, `${label}.${key}`, depth - 1);
      log(`}`);
    } else {
      log(`${label}.${key} = ${typeof value}`);
    }
  }
}

async function tryCall(label, fn) {
  try {
    const result = await fn();
    log(`CALL ${label} ->`, JSON.stringify(result, null, 2)?.slice(0, 2000));
  } catch (err) {
    log(`CALL ${label} !! ${String(err)}`);
  }
}

const client = createPaseoClient({ url, ...(password ? { password } : {}) });
const timer = setTimeout(
  () => bail(`timeout: no daemon response within ${timeoutMs}ms`),
  timeoutMs,
);

try {
  log(`connecting ${url} (password: ${password ? "yes" : "no"})`);
  await client.connect();
  clearTimeout(timer);
  log("connected");

  log("--- client surface ---");
  surface(client, "client");

  log("--- safe list calls ---");
  await tryCall("agents.list", () => client.agents.list());
  if ("workspaces" in client)
    await tryCall("workspaces.list", () => client.workspaces.list());
  if ("providers" in client)
    await tryCall("providers.list", () => client.providers.list());
  if ("schedules" in client)
    await tryCall("schedules.list", () => client.schedules.list());

  log("--- waiting 5s for unsolicited events ---");
  if (typeof client.on === "function") {
    for (const ev of [
      "agent-update",
      "agent-event",
      "permission",
      "connect",
      "disconnect",
      "error",
    ]) {
      try {
        client.on(ev, (payload) =>
          log(`EVENT ${ev}`, JSON.stringify(payload)?.slice(0, 1000)),
        );
      } catch {
        // no .on API - fine, recorded in surface dump
      }
    }
  } else {
    log("client.on unavailable - event API shape visible in surface dump");
  }
  await new Promise((r) => setTimeout(r, 5000));

  await client.close();
  log("done");
} catch (err) {
  clearTimeout(timer);
  bail(`connection failed: ${String(err)}`);
}
