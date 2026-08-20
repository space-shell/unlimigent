import { beforeEach, describe, expect, it } from "vitest";
import { createGraphStore, nextFreePosition } from "./store";

describe("graph store", () => {
  let store: ReturnType<typeof createGraphStore>;

  beforeEach(() => {
    store = createGraphStore();
  });

  it("adds a node", () => {
    const node = store.getState().addNode({ kind: "server", title: "jn-server" });
    expect(Object.keys(store.getState().nodes)).toHaveLength(1);
    expect(store.getState().nodes[node.id]?.title).toBe("jn-server");
    expect(node.origin).toBe("user");
  });

  it("connects child to parent with a contains edge", () => {
    const s = store.getState();
    const server = s.addNode({ kind: "server", title: "srv" });
    const ws = s.addNode({ kind: "workspace", title: "ws", parentId: server.id });
    const edges = Object.values(store.getState().edges);
    expect(edges).toHaveLength(1);
    expect(edges[0]).toMatchObject({ from: server.id, to: ws.id, kind: "contains" });
  });

  it("does not create an edge for an unknown parent", () => {
    store.getState().addNode({ kind: "workspace", title: "orphan", parentId: "nope" });
    expect(Object.keys(store.getState().edges)).toHaveLength(0);
  });

  it("moves a node and updates status/title", () => {
    const s = store.getState();
    const n = s.addNode({ kind: "agent", title: "a1" });
    s.moveNode(n.id, { x: 10, y: 20 });
    s.setNodeStatus(n.id, "running");
    s.setNodeTitle(n.id, "a1-renamed");
    const after = store.getState().nodes[n.id]!;
    expect(after.position).toEqual({ x: 10, y: 20 });
    expect(after.status).toBe("running");
    expect(after.title).toBe("a1-renamed");
  });

  it("removing a node drops incident edges and orphans children", () => {
    const s = store.getState();
    const server = s.addNode({ kind: "server", title: "srv" });
    const ws = s.addNode({ kind: "workspace", title: "ws", parentId: server.id });
    s.removeNode(server.id);
    const state = store.getState();
    expect(state.nodes[ws.id]?.parentId).toBeNull();
    expect(Object.keys(state.edges)).toHaveLength(0);
  });

  it("removing the focused node clears focus", () => {
    const s = store.getState();
    const n = s.addNode({ kind: "agent", title: "a" });
    s.focus(n.id);
    expect(store.getState().focusedNodeId).toBe(n.id);
    s.removeNode(n.id);
    expect(store.getState().focusedNodeId).toBeNull();
  });

  it("focus rejects unknown nodes", () => {
    store.getState().focus("nope");
    expect(store.getState().focusedNodeId).toBeNull();
  });

  it("connect is idempotent for the same pair and kind", () => {
    const s = store.getState();
    const a = s.addNode({ kind: "server", title: "a" });
    const b = s.addNode({ kind: "workspace", title: "b" });
    const e1 = s.connect(a.id, b.id, "links");
    const e2 = s.connect(a.id, b.id, "links");
    expect(e1?.id).toBe(e2?.id);
    expect(Object.keys(store.getState().edges)).toHaveLength(1);
  });

  it("connect rejects self edges and unknown nodes", () => {
    const s = store.getState();
    const a = s.addNode({ kind: "server", title: "a" });
    expect(s.connect(a.id, a.id, "links")).toBeNull();
    expect(s.connect(a.id, "nope", "links")).toBeNull();
  });

  it("snapshot/restore round-trips the graph", () => {
    const s = store.getState();
    const server = s.addNode({ kind: "server", title: "srv" });
    s.addNode({ kind: "agent", title: "a", parentId: server.id });
    const snap = s.snapshot();
    s.clear();
    expect(Object.keys(store.getState().nodes)).toHaveLength(0);
    s.restore(snap);
    const restored = store.getState();
    expect(Object.keys(restored.nodes)).toHaveLength(2);
    expect(Object.keys(restored.edges)).toHaveLength(1);
  });

  it("nextFreePosition spreads siblings around the parent", () => {
    const s = store.getState();
    const server = s.addNode({ kind: "server", title: "srv", position: { x: 0, y: 0 } });
    const p1 = nextFreePosition(store.getState(), server.id);
    s.addNode({ kind: "workspace", title: "w1", parentId: server.id, position: p1 });
    const p2 = nextFreePosition(store.getState(), server.id);
    expect(p1).not.toEqual(p2);
    expect(Math.hypot(p2.x, p2.y)).toBeGreaterThan(0);
  });

  it("collapse hides descendants and uncollapsing restores them", () => {
    const s = store.getState();
    const server = s.addNode({ kind: "server", title: "srv" });
    const ws = s.addNode({ kind: "workspace", title: "ws", parentId: server.id });
    const agent = s.addNode({ kind: "agent", title: "a", parentId: ws.id });
    expect(s.isHiddenByCollapse(agent.id)).toBe(false);
    s.toggleCollapsed(server.id);
    const after = store.getState();
    expect(after.collapsedIds.has(server.id)).toBe(true);
    expect(after.isHiddenByCollapse(ws.id)).toBe(true);
    expect(after.isHiddenByCollapse(agent.id)).toBe(true);
    expect(after.isHiddenByCollapse(server.id)).toBe(false);
    after.toggleCollapsed(server.id);
    expect(store.getState().isHiddenByCollapse(agent.id)).toBe(false);
  });

  it("collapse state round-trips through snapshot/restore", () => {
    const s = store.getState();
    const server = s.addNode({ kind: "server", title: "srv" });
    s.addNode({ kind: "workspace", title: "ws", parentId: server.id });
    s.toggleCollapsed(server.id);
    const snap = s.snapshot();
    s.clear();
    s.restore(snap);
    expect(store.getState().collapsedIds.has(server.id)).toBe(true);
  });
});
