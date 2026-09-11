// Spike Gb: raw WS frame capture against the live daemon.
//
// Logs every websocket frame in both directions while exercising the surface
// GAME_DESIGN.md needs verified: hello/handshake, agents/workspaces list with
// subscribe, schedules, and (with PASEO_GB_PERMISSIONS=1) a short-lived agent
// whose prompt should trigger a bash permission request.
//
// Usage:
//   nix develop -c bash -c 'PASEO_URL=ws://100.127.193.39:6767/ws \
//     PASEO_GB_PERMISSIONS=1 node scripts/spike-gb.mjs'
//
// Read-mostly: the only mutation is the optional probe agent (permission
// capture), created in PASEO_GB_WORKSPACE if set, else the first workspace.

import { createPaseoClient } from "@getpaseo/client";
import { appendFileSync } from "node:fs";
import WS from "ws";

const url = process.env.PASEO_URL ?? "ws://127.0.0.1:6767/ws";
const holdMs = Number(process.env.PASEO_GB_HOLD ?? 20000);
const dumpPath = process.env.PASEO_GB_DUMP ?? "/tmp/opencode/spike-gb-frames.jsonl";
const log = (...a) => console.log("[gb]", ...a);

let seq = 0;
class TapWS extends WS {
  constructor(...args) {
    super(...args);
    this.on("message", (data) => {
      frame("<<", data.toString());
    });
  }
  send(data, cb) {
    frame(">>", typeof data === "string" ? data : "<binary>");
    super.send(data, cb);
  }
}
function frame(dir, text) {
  seq += 1;
  appendFileSync(dumpPath, JSON.stringify({ seq, dir, text }) + "\n");
  const short = text.slice(0, 600);
  log(`frame ${seq} ${dir} ${short}${text.length > 600 ? " …" : ""}`);
}

const client = createPaseoClient({
  url,
  clientType: "cli",
  webSocketFactory: (u, options) => new TapWS(u, options),
});
const seen = [];
const noteEvent = (label, payload) => {
  const line = JSON.stringify(payload)?.slice(0, 4000) ?? String(payload);
  log(`EVENT ${label}: ${line}`);
};

try {
  log(`connecting ${url} (tap active, dump: ${dumpPath})`);
  await client.connect();
  log("connected");

  log("--- agents.list ---");
  const agents = await client.agents.list().catch((e) => log("agents.list !!", String(e)));
  if (agents) {
    log(
      "agents.list payload:",
      JSON.stringify(agents)?.slice(0, 3000),
      "…",
    );
  }

  log("--- workspaces.list ---");
  const workspaces = await client.workspaces.list().catch((e) =>
    log("workspaces.list !!", String(e)),
  );
  if (workspaces) {
    log(
      "workspaces.list payload:",
      JSON.stringify(workspaces)?.slice(0, 3000),
      "…",
    );
  }

  log("--- schedules namespace ---");
  log("client.schedules:", typeof client.schedules);

  log("--- subscribing (agents + workspaces) ---");
  const offA =
    typeof client.agents.subscribe === "function"
      ? client.agents.subscribe((ev) => noteEvent("agents", ev))
      : null;
  const offW =
    typeof client.workspaces.subscribe === "function"
      ? client.workspaces.subscribe((ev) => noteEvent("workspaces", ev))
      : null;

  if (process.env.PASEO_GB_PERMISSIONS === "1") {
    const wsList = Array.isArray(workspaces) ? [] : (workspaces?.entries ?? []);
    const target =
      wsList.find((w) => process.env.PASEO_GB_WORKSPACE && w.id === process.env.PASEO_GB_WORKSPACE) ??
      wsList[0];
    if (!target) {
      log("no workspace available for probe agent; skipping");
    } else {
      const cwd = target.checkout?.cwd ?? target.workspaceDirectory;
      log(`--- creating probe agent in workspace ${target.id} (${cwd}) ---`);
      const created = await client.agents
        .create({
          config: {
            provider: process.env.PASEO_GB_PROVIDER ?? "opencode/zai-coding-plan/glm-5.3-flash",
          },
          cwd,
          prompt:
            "Run the shell command `uname -a` and report the kernel version. Then stop.",
        })
        .catch((e) => log("agents.create !!", String(e)));
      log("create result:", JSON.stringify(created)?.slice(0, 2000));
    }
  }

  log(`--- holding ${holdMs}ms for unsolicited frames/events ---`);
  await new Promise((r) => setTimeout(r, holdMs));

  offA?.();
  offW?.();
  log(`done. ${seq} frames captured -> ${dumpPath}`);
  log("seen event labels:", seen.length ? seen.join(", ") : "(none)");
  await client.close?.();
  process.exit(0);
} catch (err) {
  log("FATAL", String(err));
  process.exit(1);
}
