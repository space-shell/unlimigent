// Spike 0a (part 2): observe subscribe() event payloads from the live daemon.
// Read-only: subscribes, prints one round of events, disconnects.
//
// Usage:
//   PASEO_URL=ws://host:6767/ws [PASEO_PASSWORD=...] node scripts/spike-0a-events.mjs

import { createPaseoClient } from "@getpaseo/client";

const url = process.env.PASEO_URL ?? "ws://127.0.0.1:6767/ws";
const password = process.env.PASEO_PASSWORD;
const waitMs = Number(process.env.WAIT_MS ?? 10000);

const log = (...args) => console.log("[spike-0a-ev]", ...args);

const client = createPaseoClient({ url, ...(password ? { password } : {}) });

function probeSubscribe(label, sub) {
  if (typeof sub !== "function") {
    log(`${label}.subscribe unavailable`);
    return;
  }
  try {
    const result = sub((payload) => {
      log(`EVENT ${label}:`, JSON.stringify(payload)?.slice(0, 1500));
    });
    if (result && typeof result.then === "function") {
      result.then(
        (r) => log(`${label}.subscribe() resolved:`, JSON.stringify(r)?.slice(0, 300)),
        (e) => log(`${label}.subscribe() rejected: ${String(e)}`),
      );
    } else if (result && typeof result[Symbol.iterator] === "function") {
      log(`${label}.subscribe() returned iterable (async iterator?)`);
      void (async () => {
        try {
          for await (const ev of result) {
            log(`EVENT ${label}:`, JSON.stringify(ev)?.slice(0, 1500));
          }
        } catch (e) {
          log(`${label} iterator ended: ${String(e)}`);
        }
      })();
    } else {
      log(`${label}.subscribe() returned:`, String(result).slice(0, 200));
    }
  } catch (err) {
    log(`${label}.subscribe() threw: ${String(err)}`);
  }
}

await client.connect();
log("connected");

probeSubscribe("agents", client.agents.subscribe);
probeSubscribe("workspaces", client.workspaces.subscribe);
probeSubscribe("providers", client.providers.subscribe);

log(`waiting ${waitMs}ms for events (poke the daemon: run an agent, edit a workspace)...`);
await new Promise((r) => setTimeout(r, waitMs));

await client.close();
log("done");
