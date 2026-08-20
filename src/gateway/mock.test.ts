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
      title: "workspace a",
      projectId: "prj_1",
      projectDisplayName: "proj",
      workspaceKind: "local_checkout",
      branch: "main",
      remoteUrl: null,
      pullRequest: null,
      status: "active",
    },
    {
      id: "wks_b",
      title: "worktree b",
      projectId: "prj_1",
      projectDisplayName: "proj",
      workspaceKind: "worktree",
      branch: "feat",
      remoteUrl: "git@github.com:x/y.git",
      pullRequest: { title: "pr 1", state: "open" },
      status: "active",
    },
  ],
  agents: [
    {
      id: "agt_1",
      provider: "opencode",
      model: "glm-5.3",
      cwd: "/p",
      workspaceId: "wks_a",
      status: "running",
      title: "agent one",
    },
  ],
});

describe("gateway projection", () => {
  let store: ReturnType<typeof createGraphStore>;

  beforeEach(() => {
    store = createGraphStore();
  });

  it("builds server/workspace/agent nodes from a snapshot", () => {
    projectGatewayEvent(store, { kind: "snapshot", snapshot: snapshot() });
    const nodes = Object.values(store.getState().nodes);
    expect(nodes.filter((n) => n.kind === "server")).toHaveLength(1);
    expect(nodes.filter((n) => n.kind === "workspace")).toHaveLength(1);
    expect(nodes.filter((n) => n.kind === "worktree")).toHaveLength(1);
    expect(nodes.filter((n) => n.kind === "agent")).toHaveLength(1);
  });

  it("nests worktrees under their project workspace", () => {
    projectGatewayEvent(store, { kind: "snapshot", snapshot: snapshot() });
    const nodes = store.getState().nodes;
    const root = Object.values(nodes).find((n) => n.externalId === "wks_a");
    const worktree = Object.values(nodes).find((n) => n.externalId === "wks_b");
    expect(root?.kind).toBe("workspace");
    expect(worktree?.kind).toBe("worktree");
    expect(worktree?.parentId).toBe(root?.id);
  });

  it("marks workspaces with open PRs as attention", () => {
    projectGatewayEvent(store, { kind: "snapshot", snapshot: snapshot() });
    const b = Object.values(store.getState().nodes).find((n) => n.externalId === "wks_b");
    expect(b?.status).toBe("attention");
  });

  it("updates an existing agent instead of duplicating", () => {
    projectGatewayEvent(store, { kind: "snapshot", snapshot: snapshot() });
    projectGatewayEvent(store, {
      kind: "agent-updated",
      agent: {
        id: "agt_1",
        provider: "opencode",
        model: "glm-5.3",
        cwd: "/p",
        workspaceId: "wks_a",
        status: "idle",
        title: "agent one",
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

  it("archives a workspace on workspace-archived", () => {
    projectGatewayEvent(store, { kind: "snapshot", snapshot: snapshot() });
    projectGatewayEvent(store, { kind: "workspace-archived", id: "wks_a" });
    const a = Object.values(store.getState().nodes).find((n) => n.externalId === "wks_a");
    expect(a?.status).toBe("archived");
  });

  it("is idempotent across repeated snapshots", () => {
    projectGatewayEvent(store, { kind: "snapshot", snapshot: snapshot() });
    projectGatewayEvent(store, { kind: "snapshot", snapshot: snapshot() });
    expect(Object.keys(store.getState().nodes)).toHaveLength(4);
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
    expect(state.nodes).toBeDefined();
    expect(Object.values(state.nodes).map((n) => n.externalId).sort()).toEqual([
      null,
      "wks_a",
    ]);
    expect(Object.keys(state.edges)).toHaveLength(1);
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
