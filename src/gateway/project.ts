import type { GraphStore } from "../graph/store";
import { autoArrange } from "../graph/arrange";
import type { GraphNode, NodeStatus } from "../graph/types";
import type { GatewayAgent, GatewayEvent, GatewaySnapshot, GatewayWorkspace } from "./types";

/** Projection: daemon truth → graph nodes. Hierarchy mirrors Paseo exactly
 * (verified 2026-08-20, see INTENT.md "Node ontology"):
 *   server → project → workspace (local | worktree, siblings) → agent sessions
 * Archived entities never visualise; nodes are removed when entities archive.
 * New nodes trigger an auto-arrange re-flow (pinned nodes keep positions). */

function agentStatus(agent: GatewayAgent): NodeStatus {
  if (agent.requiresAttention || agent.pendingPermissions > 0) return "attention";
  return agent.status;
}

function workspaceStatus(ws: GatewayWorkspace): NodeStatus {
  if (ws.pullRequest) return "attention";
  if (ws.status === "done") return "done";
  if (ws.status === "running") return "running";
  return "idle";
}

function workspaceMeta(ws: GatewayWorkspace): GraphNode["meta"] {
  const gitBits: Array<string> = [];
  if (ws.isDirty) gitBits.push("dirty");
  if (ws.ahead) gitBits.push(`↑${ws.ahead}`);
  if (ws.behind) gitBits.push(`↓${ws.behind}`);
  return {
    branch: ws.branch,
    path: ws.directory,
    remote: ws.remoteUrl,
    pr: ws.pullRequest ? `${ws.pullRequest.state}: ${ws.pullRequest.title}` : null,
    diff: ws.diffStat,
    git: gitBits.length ? gitBits.join(" ") : null,
  };
}

function agentMeta(agent: GatewayAgent): GraphNode["meta"] {
  return {
    provider: agent.provider,
    model: agent.model,
    mode: agent.mode,
    cwd: agent.cwd,
    permissions: agent.pendingPermissions > 0 ? String(agent.pendingPermissions) : null,
    attention: agent.attentionReason,
    activity: agent.lastActivityAt,
  };
}

function findByExternalId(
  store: GraphStore,
  externalId: string,
): GraphNode | undefined {
  return Object.values(store.getState().nodes).find(
    (n) => n.origin === "gateway" && n.externalId === externalId,
  );
}

function ensureServer(store: GraphStore, host: string): string {
  const server = Object.values(store.getState().nodes).find(
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

function ensureProject(store: GraphStore, serverId: string, projectId: string, name: string): string {
  const existing = findByExternalId(store, projectId);
  if (existing) return existing.id;
  const siblings = Object.values(store.getState().nodes).filter(
    (n) => n.parentId === serverId && n.kind === "project",
  );
  const i = siblings.length;
  const angle = (i * Math.PI) / 4 - Math.PI / 2;
  return store.getState().addNode({
    kind: "project",
    title: name,
    parentId: serverId,
    origin: "gateway",
    externalId: projectId,
    position: {
      x: 4 + Math.cos(angle) * 3,
      y: Math.sin(angle) * 3,
    },
  }).id;
}

function upsertWorkspace(store: GraphStore, projectId: string, ws: GatewayWorkspace): boolean {
  const existing = findByExternalId(store, ws.id);
  const kind = ws.workspaceKind === "worktree" ? "worktree" : "workspace";
  const meta = workspaceMeta(ws);
  const title = kind === "worktree" ? (ws.branch ?? ws.name) : ws.name;

  if (existing) {
    // persisted graphs can predate hierarchy fixes — trust the daemon, always
    const reparented = store.getState().reparent(existing.id, projectId);
    store.getState().setNodeTitle(existing.id, title);
    store.getState().setNodeStatus(existing.id, workspaceStatus(ws));
    store.getState().nodes[existing.id]!.meta = { ...meta, worktree: kind === "worktree" ? ws.name : null };
    return reparented;
  }

  const state = store.getState();
  const siblings = Object.values(state.nodes).filter(
    (n) => n.parentId === projectId && (n.kind === "workspace" || n.kind === "worktree"),
  );
  const i = siblings.length;
  store.getState().addNode({
    kind,
    title,
    parentId: projectId,
    origin: "gateway",
    externalId: ws.id,
    status: workspaceStatus(ws),
    position: {
      x: 3 + i * 0.4,
      y: -2.2 - i * 1.8,
    },
    meta: { ...meta, worktree: kind === "worktree" ? ws.name : null },
  });
  return true;
}

function upsertAgent(store: GraphStore, agent: GatewayAgent): boolean {
  const state = store.getState();
  const existing = findByExternalId(store, agent.id);
  const parent = agent.workspaceId
    ? findByExternalId(store, agent.workspaceId)
    : undefined;
  if (existing) {
    // persisted graphs can predate hierarchy fixes — trust the daemon
    const reparented = store.getState().reparent(existing.id, parent?.id ?? null);
    store.getState().setNodeStatus(existing.id, agentStatus(agent));
    store.getState().setNodeTitle(existing.id, agent.title);
    store.getState().nodes[existing.id]!.meta = agentMeta(agent);
    return reparented;
  }
  const parentId = parent?.id ?? null;
  const siblings = parentId
    ? Object.values(state.nodes).filter((n) => n.parentId === parentId && n.kind === "agent")
    : [];
  const i = siblings.length;
  store.getState().addNode({
    kind: "agent",
    title: agent.title,
    parentId,
    origin: "gateway",
    externalId: agent.id,
    status: agentStatus(agent),
    position: parent
      ? { x: 2 + i * 0.3, y: parent.position.y - 2 - i * 1.6 }
      : { x: 0, y: -4 },
    meta: agentMeta(agent),
  });
  return true;
}

/** Remove workspace/agent nodes whose entity disappeared or archived, and
 * project nodes with no live workspaces left. Returns removal count. */
function pruneOrphans(store: GraphStore, snapshot: GatewaySnapshot): number {
  const liveIds = new Set<string>([
    ...snapshot.workspaces.map((w) => w.id),
    ...snapshot.agents.map((a) => a.id),
  ]);
  const state = store.getState();
  let removed = 0;
  for (const node of Object.values(state.nodes)) {
    if (node.origin !== "gateway" || node.kind === "server" || node.kind === "project") continue;
    if (node.externalId !== null && !liveIds.has(node.externalId)) {
      store.getState().removeNode(node.id);
      removed += 1;
    }
  }
  // projects with no remaining workspaces are removed too
  const after = store.getState();
  const projectIds = new Set(snapshot.workspaces.map((w) => w.projectId));
  for (const node of Object.values(after.nodes)) {
    if (node.origin === "gateway" && node.kind === "project" && !projectIds.has(node.externalId ?? "")) {
      store.getState().removeNode(node.id);
      removed += 1;
    }
  }
  return removed;
}

function applySnapshot(store: GraphStore, snapshot: GatewaySnapshot): void {
  const serverId = ensureServer(store, snapshot.daemonHost);
  let changed = false;
  for (const ws of snapshot.workspaces) {
    const projectId = ensureProject(store, serverId, ws.projectId, ws.projectDisplayName);
    changed = upsertWorkspace(store, projectId, ws) || changed;
  }
  for (const agent of snapshot.agents) changed = upsertAgent(store, agent) || changed;
  const removed = pruneOrphans(store, snapshot);
  if (changed || removed > 0) void autoArrange(store);
}

export function projectGatewayEvent(store: GraphStore, event: GatewayEvent): void {
  switch (event.kind) {
    case "snapshot":
      applySnapshot(store, event.snapshot);
      break;
    case "workspace-updated": {
      // only genuinely archived workspaces are removed on update
      if (event.workspace.status === "archived") {
        const existing = findByExternalId(store, event.workspace.id);
        if (existing) {
          store.getState().removeNode(existing.id);
          void autoArrange(store);
        }
        break;
      }
      const state = store.getState();
      const server = Object.values(state.nodes).find(
        (n) => n.kind === "server" && n.origin === "gateway",
      );
      if (server) {
        const projectId = ensureProject(store, server.id, event.workspace.projectId, event.workspace.projectDisplayName);
        upsertWorkspace(store, projectId, event.workspace);
      }
      break;
    }
    case "workspace-archived": {
      const existing = findByExternalId(store, event.id);
      if (existing) {
        store.getState().removeNode(existing.id);
        void autoArrange(store);
      }
      break;
    }
    case "agent-updated":
      if (event.agent.archived) {
        const existing = findByExternalId(store, event.agent.id);
        if (existing) {
          store.getState().removeNode(existing.id);
          void autoArrange(store);
        }
        break;
      }
      upsertAgent(store, event.agent);
      break;
    case "agent-removed": {
      const existing = findByExternalId(store, event.id);
      if (existing) {
        store.getState().removeNode(existing.id);
        void autoArrange(store);
      }
      break;
    }
    case "connection":
      break;
  }
}

export function connectGateway(
  store: GraphStore,
  gateway: { subscribe: (l: (e: GatewayEvent) => void) => () => void },
): () => void {
  return gateway.subscribe((event) => projectGatewayEvent(store, event));
}
