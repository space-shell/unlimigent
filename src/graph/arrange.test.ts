import { describe, expect, it } from "vitest";
import { createGraphStore } from "./store";
import { autoArrange, GRID_WORLD } from "./arrange";

describe("autoArrange", () => {
  it("assigns grid-snapped positions to every node and de-overlaps siblings", async () => {
    const store = createGraphStore();
    const s = store.getState();
    const server = s.addNode({ kind: "server", title: "srv", position: { x: 0, y: 0 } });
    for (let i = 0; i < 4; i++) {
      s.addNode({
        kind: "workspace",
        title: `w${i}`,
        parentId: server.id,
        position: { x: 0, y: 0 },
      });
    }
    const result = await autoArrange(store);
    expect(result.moved).toBe(5);
    const positions = Object.values(store.getState().nodes).map((n) => n.position);
    const unique = new Set(positions.map((p) => `${p.x},${p.y}`));
    expect(unique.size).toBe(5);
    for (const p of positions) {
      expect(p.x % GRID_WORLD).toBe(0);
      expect(p.y % GRID_WORLD).toBe(0);
    }
  });

  it("keeps pinned nodes where the user placed them", async () => {
    const store = createGraphStore();
    const s = store.getState();
    const a = s.addNode({ kind: "server", title: "srv", position: { x: 123, y: 45 } });
    s.addNode({ kind: "agent", title: "a", parentId: a.id, position: { x: 0, y: 0 } });
    s.pinNode(a.id, true);
    const result = await autoArrange(store);
    expect(store.getState().nodes[a.id]!.position).toEqual({ x: 123, y: 45 });
    expect(result.moved).toBe(1);
  });

  it("is a no-op on an empty graph", async () => {
    const store = createGraphStore();
    expect(await autoArrange(store)).toEqual({ moved: 0 });
  });
});
