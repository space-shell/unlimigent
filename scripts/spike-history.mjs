// One-shot raw probe: fetch_agent_history_request — learn filter + shape.
// Usage: nix develop -c bash -c 'PASEO_URL=ws://127.0.0.1:6767/ws \
//   AGENT_ID=<uuid> node scripts/spike-history.mjs'
import WS from "ws";

const url = process.env.PASEO_URL ?? "ws://127.0.0.1:6767/ws";
const agentId = process.env.AGENT_ID ?? "c521b946-bb19-4158-ada3-94acb28791a2";
const log = (...a) => console.log("[hist]", ...a);

const ws = new WS(url);
const send = (m) => ws.send(JSON.stringify(m));
ws.on("message", (d) => {
  const t = d.toString();
  if (t.includes("agent_timeline")) log("<<", t.slice(0, 4500));
});
ws.on("open", () => {
  log("connected; history for", agentId);
  send({
    type: "hello",
    clientId: "unlimigent-hist-probe",
    clientType: "cli",
    protocolVersion: 1,
    capabilities: {},
  });
  send({
    type: "session",
    message: {
      type: "fetch_agent_timeline_request",
      agentId,
      requestId: "tl-1",
      direction: "descending",
      limit: 12,
    },
  });
  setTimeout(() => {
    log("done");
    process.exit(0);
  }, 6000);
});
