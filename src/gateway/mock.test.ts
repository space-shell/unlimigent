import { beforeEach, describe, expect, it } from "vitest";
import { createGraphStore } from "../graph/store";
import { MockPaseoGateway } from "./mock";
import { connectGateway, projectGatewayEvent } from "./project";
import type { GatewayEvent, GatewaySnapshot } from "./types";

function manualClock() {
  let fn: (() => void) | null = null;
  return {
    setInterval: (f: () => void, _ms: number) => {
      fn = f;
      return 1;
    },
    clearInterval: () => {
      fn = null;
    },
    tick: () => fn?.(),
  };
}

const snapshot = (): GatewaySnapshot => ({
  daemonHost: "test-host",
  workspaces: [
    {
      id: "wks_a",
      name: "workspace a",
      title: null,
      projectId: "prj_1",
      projectDisplayName: "proj",
      workspaceKind: "local_checkout",
      directory: "/p/a",
      projectRootPath: "/p/a",
      branch: "main",
      remoteUrl: null,
      isDirty: false,
      ahead: 0,
      behind: 0,
      pullRequest: null,
      diffStat: null,
      status: "active",
    },
    {
      id: "wks_b",
      name: "worktree b",
      title: null,
      projectId: "prj_1",
      projectDisplayName: "proj",
      workspaceKind: "worktree",
      directory: "/p/a/.worktrees/b",
      projectRootPath: "/p/a",
      branch: "feat",
      remoteUrl: "git@github.com:x/y.git",
      isDirty: false,
      ahead: 0,
      behind: 0,
      pullRequest: { title: "pr 1", state: "open" },
      diffStat: "+1 −1",
      status: "active",
    },
  ],
  agents: [
    {
      id: "agt_1",
      title: "agent one",
      provider: "opencode",
      model: "glm-5.3",
      cwd: "/p",
      workspaceId: "wks_a",
      status: "running",
      mode: "build",
      requiresAttention: false,
      attentionReason: null,
      pendingPermissions: 0,
      lastActivityAt: null,
      archived: false,
    },
  ],
});

describe("gateway projection", () => {
  let store: ReturnType<typeof createGraphStore>;

  beforeEach(() => {
    store = createGraphStore();
  });

  it("builds server → project → workspace/worktree (siblings) → agent", () => {
    projectGatewayEvent(store, { kind: "snapshot", snapshot: snapshot() });
    const nodes = Object.values(store.getState().nodes);
    const server = nodes.find((n) => n.kind === "server")!;
    const project = nodes.find((n) => n.kind === "project")!;
    const ws = nodes.find((n) => n.externalId === "wks_a")!;
    const wt = nodes.find((n) => n.externalId === "wks_b")!;
    const agent = nodes.find((n) => n.kind === "agent")!;
    expect(project.parentId).toBe(server.id);
    // local and worktree are SIBLINGS under the project
    expect(ws.parentId).toBe(project.id);
    expect(wt.parentId).toBe(project.id);
    expect(agent.parentId).toBe(ws.id);
  });

  it("workspace nodes: branch title + Local sub; worktrees: branch title + folder sub; project carries path", () => {
    projectGatewayEvent(store, { kind: "snapshot", snapshot: snapshot() });
    const nodes = store.getState().nodes;
    const project = Object.values(nodes).find((n) => n.kind === "project");
    const ws = Object.values(nodes).find((n) => n.externalId === "wks_a");
    const wt = Object.values(nodes).find((n) => n.externalId === "wks_b");
    expect(ws?.title).toBe("main");
    expect(ws?.meta.worktree).toBeNull();
    expect(wt?.title).toBe("feat");
    expect(wt?.meta.worktree).toBe("b");
    expect(wt?.meta.pr).toBe("open: pr 1");
    expect(project?.title).toBe("proj");
    expect(project?.meta.path).toBe("/p/a");
  });

  it("marks workspaces with open PRs as attention", () => {
    projectGatewayEvent(store, { kind: "snapshot", snapshot: snapshot() });
    const b = Object.values(store.getState().nodes).find((n) => n.externalId === "wks_b");
    expect(b?.status).toBe("attention");
  });

  it("marks agents attention when permissions are pending", () => {
    projectGatewayEvent(store, { kind: "snapshot", snapshot: snapshot() });
    projectGatewayEvent(store, {
      kind: "agent-updated",
      agent: {
        ...snapshot().agents[0]!,
        status: "idle",
        requiresAttention: true,
        pendingPermissions: 2,
      },
    });
    const agent = Object.values(store.getState().nodes).find((n) => n.kind === "agent");
    expect(agent?.status).toBe("attention");
    expect(agent?.meta.permissions).toBe("2");
  });

  it("keeps done workspaces visible with done status", () => {
    projectGatewayEvent(store, { kind: "snapshot", snapshot: snapshot() });
    projectGatewayEvent(store, {
      kind: "workspace-updated",
      workspace: { ...snapshot().workspaces[0]!, status: "done" },
    });
    const ws = Object.values(store.getState().nodes).find((n) => n.externalId === "wks_a");
    expect(ws).toBeDefined();
    expect(ws?.status).toBe("done");
  });

  it("removes nodes for entities that archived between polls", () => {
    projectGatewayEvent(store, { kind: "snapshot", snapshot: snapshot() });
    expect(Object.values(store.getState().nodes).some((n) => n.externalId === "wks_b")).toBe(true);
    projectGatewayEvent(store, {
      kind: "workspace-updated",
      workspace: { ...snapshot().workspaces[1]!, status: "archived" },
    });
    expect(Object.values(store.getState().nodes).some((n) => n.externalId === "wks_b")).toBe(false);
  });

  it("removes agent nodes when an archived agent arrives", () => {
    projectGatewayEvent(store, { kind: "snapshot", snapshot: snapshot() });
    projectGatewayEvent(store, {
      kind: "agent-updated",
      agent: { ...snapshot().agents[0]!, archived: true },
    });
    expect(Object.values(store.getState().nodes).some((n) => n.kind === "agent")).toBe(false);
  });

  it("removes a project when its last workspace disappears", () => {
    projectGatewayEvent(store, { kind: "snapshot", snapshot: snapshot() });
    const shrunk: GatewaySnapshot = {
      daemonHost: "test-host",
      workspaces: [],
      agents: [],
    };
    projectGatewayEvent(store, { kind: "snapshot", snapshot: shrunk });
    const kinds = Object.values(store.getState().nodes).map((n) => n.kind);
    expect(kinds).toEqual(["server"]);
  });

  it("prunes gateway nodes absent from a later snapshot", () => {
    projectGatewayEvent(store, { kind: "snapshot", snapshot: snapshot() });
    const shrunk: GatewaySnapshot = {
      ...snapshot(),
      workspaces: snapshot().workspaces.filter((w) => w.id === "wks_a"),
      agents: [],
    };
    projectGatewayEvent(store, { kind: "snapshot", snapshot: shrunk });
    const state = store.getState();
    const remaining = Object.values(state.nodes);
    expect(remaining.some((n) => n.externalId === "wks_b")).toBe(false);
    expect(remaining.some((n) => n.kind === "agent")).toBe(false);
    expect(remaining.some((n) => n.externalId === "wks_a")).toBe(true);
    // project survives: prj_1 still has wks_a
    expect(remaining.some((n) => n.kind === "project")).toBe(true);
    // edges to removed nodes are gone
    expect(
      Object.values(state.edges).every(
        (e) => state.nodes[e.from] && state.nodes[e.to],
      ),
    ).toBe(true);
  });

  it("updates an existing agent instead of duplicating", () => {
    projectGatewayEvent(store, { kind: "snapshot", snapshot: snapshot() });
    projectGatewayEvent(store, {
      kind: "agent-updated",
      agent: {
        ...snapshot().agents[0]!,
        status: "idle",
        requiresAttention: false,
        pendingPermissions: 0,
      },
    });
    const agents = Object.values(store.getState().nodes).filter((n) => n.kind === "agent");
    expect(agents).toHaveLength(1);
    expect(agents[0]?.status).toBe("idle");
  });

  it("removes agent nodes on agent-removed", () => {
    projectGatewayEvent(store, { kind: "snapshot", snapshot: snapshot() });
    projectGatewayEvent(store, { kind: "agent-removed", id: "agt_1" });
    expect(
      Object.values(store.getState().nodes).filter((n) => n.kind === "agent"),
    ).toHaveLength(0);
  });

  it("repairs stale parents from persisted graphs on snapshot", () => {
    // simulate an old persisted node with a wrong parent (workspace under server)
    const s = store.getState();
    const server = s.addNode({ kind: "server", title: "test-host" });
    const stale = s.addNode({ kind: "workspace", title: "workspace a", parentId: server.id, origin: "gateway", externalId: "wks_a" });
    projectGatewayEvent(store, { kind: "snapshot", snapshot: snapshot() });
    const nodes = Object.values(store.getState().nodes);
    const project = nodes.find((n) => n.kind === "project")!;
    const ws = store.getState().nodes[stale.id]!;
    // wks_a now hangs off its project, not the server
    expect(ws.parentId).toBe(project.id);
    expect(
      Object.values(store.getState().edges).some(
        (e) => e.kind === "contains" && e.from === project.id && e.to === stale.id,
      ),
    ).toBe(true);
  });

  it("is idempotent across repeated snapshots", () => {
    projectGatewayEvent(store, { kind: "snapshot", snapshot: snapshot() });
    projectGatewayEvent(store, { kind: "snapshot", snapshot: snapshot() });
    expect(Object.keys(store.getState().nodes)).toHaveLength(5);
  });
});

describe("mock gateway", () => {
  it("emits connection + snapshot on start, events on tick", async () => {
    const clock = manualClock();
    const gateway = new MockPaseoGateway({ clock: clock as never });
    const events: GatewayEvent[] = [];
    gateway.subscribe((e) => events.push(e));
    gateway.start();
    expect(events.map((e) => e.kind)).toEqual(["connection", "snapshot"]);

    clock.tick();
    expect(events.length).toBeGreaterThan(2);
    gateway.stop();
  });

  it("feeds a graph store through connectGateway", () => {
    const store2 = createGraphStore();
    const clock = manualClock();
    const gateway = new MockPaseoGateway({ clock: clock as never });
    const disconnect = connectGateway(store2, gateway);
    gateway.start();
    expect(Object.keys(store2.getState().nodes).length).toBeGreaterThan(0);
    gateway.stop();
    disconnect();
  });
});
