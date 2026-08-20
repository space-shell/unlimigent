import type { GraphStore } from "../graph/store";
import { autoArrange } from "../graph/arrange";
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

function isWorktreeKind(ws: GatewayWorkspace): boolean {
  return ws.workspaceKind !== "local_checkout";
}

function upsertWorkspace(
  store: GraphStore,
  serverId: string,
  ws: GatewayWorkspace,
): boolean {
  const state = store.getState();
  const existing = Object.values(state.nodes).find(
    (n) => n.origin === "gateway" && n.externalId === ws.id,
  );
  const meta = {
    branch: ws.branch,
    remote: ws.remoteUrl,
    pr: ws.pullRequest ? `${ws.pullRequest.state}:${ws.pullRequest.title}` : null,
    projectId: ws.projectId,
  };

  // worktrees hang off their project's root workspace; roots hang off the server
  let parentId = serverId;
  let anchor: { x: number; y: number } | null = null;
  if (isWorktreeKind(ws)) {
    const root = Object.values(state.nodes).find(
      (n) =>
        n.kind === "workspace" &&
        n.origin === "gateway" &&
        n.meta.projectId === ws.projectId,
    );
    if (root) {
      parentId = root.id;
      anchor = root.position;
    }
  }

  if (existing) {
    store.getState().setNodeTitle(existing.id, ws.title);
    store.getState().setNodeStatus(existing.id, workspaceStatus(ws));
    store.getState().nodes[existing.id]!.meta = meta;
    return false;
  }

  if (anchor) {
    const siblings = Object.values(state.nodes).filter(
      (n) => n.parentId === parentId && n.kind === "worktree",
    );
    const i = siblings.length;
    store.getState().addNode({
      kind: "worktree",
      title: ws.title,
      parentId,
      origin: "gateway",
      externalId: ws.id,
      status: workspaceStatus(ws),
      position: {
        x: anchor.x + 3 + i * 0.5,
        y: anchor.y - 2.4 - i * 0.35,
      },
      meta,
    });
    return true;
  }

  const roots = Object.values(state.nodes).filter(
    (n) => n.parentId === serverId && n.kind === "workspace",
  );
  const i = roots.length;
  const angle = (i * Math.PI) / 4 - Math.PI / 2;
  store.getState().addNode({
    kind: "workspace",
    title: ws.title,
    parentId,
    origin: "gateway",
    externalId: ws.id,
    status: workspaceStatus(ws),
    position: {
      x: 5.5 + Math.cos(angle) * 3.5,
      y: Math.sin(angle) * 3,
    },
    meta,
  });
  return true;
}

function upsertAgent(store: GraphStore, agent: GatewayAgent): boolean {
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
    return false;
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
  return true;
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
  // roots first so worktrees can find their project's workspace node
  const ordered = [
    ...snapshot.workspaces.filter((w) => !isWorktreeKind(w)),
    ...snapshot.workspaces.filter(isWorktreeKind),
  ];
  let added = 0;
  for (const ws of ordered) added += upsertWorkspace(store, serverId, ws) ? 1 : 0;
  for (const agent of snapshot.agents) added += upsertAgent(store, agent) ? 1 : 0;

  // a snapshot is authoritative for gateway-origin nodes: prune anything the
  // daemon no longer reports (also clears a previous gateway's leftovers,
  // e.g. mock nodes persisted before switching to the live daemon)
  const liveIds = new Set<string>([
    ...snapshot.workspaces.map((w) => w.id),
    ...snapshot.agents.map((a) => a.id),
  ]);
  const state = store.getState();
  const stale = Object.values(state.nodes).filter(
    (n) =>
      n.origin === "gateway" &&
      n.kind !== "server" &&
      n.externalId !== null &&
      !liveIds.has(n.externalId),
  );
  for (const node of stale) store.getState().removeNode(node.id);

  // new nodes → re-flow the graph (pinned nodes keep their positions)
  if (added > 0) void autoArrange(store);
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
