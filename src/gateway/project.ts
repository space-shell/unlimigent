import type { GraphStore } from "../graph/store";
import type { NodeStatus } from "../graph/types";
import type { GatewayAgent, GatewayEvent, GatewaySnapshot, GatewayWorkspace } from "./types";

function agentStatus(status: GatewayAgent["status"]): NodeStatus {
  return status;
}

function workspaceStatus(ws: GatewayWorkspace): NodeStatus {
  if (ws.status === "done" || ws.status === "archived") return "archived";
  if (ws.pullRequest) return "attention";
  return "idle";
}

function upsertWorkspace(
  store: GraphStore,
  serverId: string,
  ws: GatewayWorkspace,
): void {
  const state = store.getState();
  const existing = Object.values(state.nodes).find(
    (n) => n.origin === "gateway" && n.externalId === ws.id,
  );
  const meta = {
    branch: ws.branch,
    remote: ws.remoteUrl,
    pr: ws.pullRequest ? `${ws.pullRequest.state}:${ws.pullRequest.title}` : null,
  };
  if (existing) {
    store.getState().setNodeTitle(existing.id, ws.title);
    store.getState().setNodeStatus(existing.id, workspaceStatus(ws));
    store.getState().nodes[existing.id]!.meta = meta;
    return;
  }
  const siblings = Object.values(state.nodes).filter(
    (n) => n.parentId === serverId && n.kind === "workspace",
  );
  const angle = (siblings.length * Math.PI) / 4;
  store.getState().addNode({
    kind: ws.workspaceKind === "worktree" ? "worktree" : "workspace",
    title: ws.title,
    parentId: serverId,
    origin: "gateway",
    externalId: ws.id,
    status: workspaceStatus(ws),
    position: {
      x: 5.5 + Math.cos(angle) * 3.5,
      y: Math.sin(angle) * 3,
    },
    meta,
  });
}

function upsertAgent(store: GraphStore, agent: GatewayAgent): void {
  const state = store.getState();
  const existing = Object.values(state.nodes).find(
    (n) => n.origin === "gateway" && n.externalId === agent.id,
  );
  const parent = agent.workspaceId
    ? Object.values(state.nodes).find(
        (n) => n.origin === "gateway" && n.externalId === agent.workspaceId,
      )
    : undefined;
  if (existing) {
    store.getState().setNodeStatus(existing.id, agentStatus(agent.status));
    store.getState().setNodeTitle(existing.id, agent.title);
    return;
  }
  const parentId = parent?.id ?? null;
  const siblings = parentId
    ? Object.values(state.nodes).filter((n) => n.parentId === parentId && n.kind === "agent")
    : [];
  const angle = (siblings.length * Math.PI) / 5;
  store.getState().addNode({
    kind: "agent",
    title: agent.title,
    parentId,
    origin: "gateway",
    externalId: agent.id,
    status: agentStatus(agent.status),
    position: parent
      ? {
          x: parent.position.x + Math.cos(angle) * (2.5 + siblings.length * 0.4),
          y: parent.position.y - 2.2 + Math.sin(angle) * 1.4,
        }
      : { x: 0, y: -4 },
    meta: { provider: agent.provider, model: agent.model, cwd: agent.cwd },
  });
}

function ensureServer(store: GraphStore, host: string): string {
  const state = store.getState();
  const server = Object.values(state.nodes).find(
    (n) => n.kind === "server" && n.origin === "gateway",
  );
  if (server) return server.id;
  return store.getState().addNode({
    kind: "server",
    title: host,
    origin: "gateway",
    position: { x: 0, y: 0 },
  }).id;
}

function applySnapshot(store: GraphStore, snapshot: GatewaySnapshot): void {
  const serverId = ensureServer(store, snapshot.daemonHost);
  for (const ws of snapshot.workspaces) upsertWorkspace(store, serverId, ws);
  for (const agent of snapshot.agents) upsertAgent(store, agent);
}

export function projectGatewayEvent(store: GraphStore, event: GatewayEvent): void {
  switch (event.kind) {
    case "snapshot":
      applySnapshot(store, event.snapshot);
      break;
    case "workspace-updated": {
      const state = store.getState();
      const server = Object.values(state.nodes).find(
        (n) => n.kind === "server" && n.origin === "gateway",
      );
      if (server) upsertWorkspace(store, server.id, event.workspace);
      break;
    }
    case "workspace-archived": {
      const state = store.getState();
      const ws = Object.values(state.nodes).find(
        (n) => n.origin === "gateway" && n.externalId === event.id,
      );
      if (ws) store.getState().setNodeStatus(ws.id, "archived");
      break;
    }
    case "agent-updated":
      upsertAgent(store, event.agent);
      break;
    case "agent-removed": {
      const state = store.getState();
      const agent = Object.values(state.nodes).find(
        (n) => n.origin === "gateway" && n.externalId === event.id,
      );
      if (agent) store.getState().removeNode(agent.id);
      break;
    }
    case "connection":
      // connection state surfaces in the UI layer, not the graph
      break;
  }
}

export function connectGateway(
  store: GraphStore,
  gateway: { subscribe: (l: (e: GatewayEvent) => void) => () => void },
): () => void {
  return gateway.subscribe((event) => projectGatewayEvent(store, event));
}
