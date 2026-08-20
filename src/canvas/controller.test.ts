import { describe, expect, it } from "vitest";
import { createGraphStore } from "../graph/store";
import { IntentBus } from "../intents/bus";
import { CameraController } from "./controller";
import {
  panBy,
  screenToWorld,
  viewRect,
  worldToScreen,
  zoomAt,
  ZOOM_MAX,
  ZOOM_MIN,
} from "./cameraMath";

const VP = { width: 2000, height: 1200 };

function rig() {
  const store = createGraphStore();
  store.getState().setCamera({ theta: 0 });
  const bus = new IntentBus();
  const frames: Array<() => void> = [];
  let clockMs = 0;
  const controller = new CameraController(store, bus, {
    getViewport: () => VP,
    requestAnimationFrame: (cb) => {
      frames.push(() => cb(clockMs));
      return frames.length;
    },
    cancelAnimationFrame: () => {},
    now: () => clockMs,
  });
  controller.attach();
  const advance = (ms: number) => {
    while (frames.length) {
      clockMs += ms;
      frames.shift()!();
    }
  };
  return { store, bus, controller, frames, advance };
}

describe("camera math", () => {
  it("screen/world round-trips", () => {
    const cam = { x: 10, y: -4, zoom: 48 };
    const w = screenToWorld(300, 200, cam, VP);
    const s = worldToScreen(w.x, w.y, cam, VP);
    expect(s.x).toBeCloseTo(300);
    expect(s.y).toBeCloseTo(200);
  });

  it("pan shifts the camera opposite to the drag", () => {
    const cam = panBy({ x: 0, y: 0, zoom: 48 }, 96, -48);
    expect(cam.x).toBeCloseTo(-2);
    expect(cam.y).toBeCloseTo(-1);
  });

  it("zoomAt pins the world point under the origin", () => {
    const cam = { x: 3, y: 2, zoom: 48 };
    const origin = { x: 700, y: 400 };
    const before = screenToWorld(origin.x, origin.y, cam, VP);
    const after = zoomAt(cam, 1.5, origin, VP);
    const pinned = screenToWorld(origin.x, origin.y, after, VP);
    expect(pinned.x).toBeCloseTo(before.x);
    expect(pinned.y).toBeCloseTo(before.y);
    expect(after.zoom).toBe(72);
  });

  it("zoomAt clamps to bounds", () => {
    expect(zoomAt({ x: 0, y: 0, zoom: 200 }, 4, null, VP).zoom).toBe(ZOOM_MAX);
    expect(zoomAt({ x: 0, y: 0, zoom: 8 }, 0.01, null, VP).zoom).toBe(ZOOM_MIN);
  });

  it("viewRect returns rotated-screen viewport bounds", () => {
    const rect = viewRect({ x: 0, y: 0, zoom: 48 }, VP);
    expect(rect.right - rect.left).toBe(VP.width);
  });

  it("iso rotation round-trips and pans along the rotated axis", () => {
    const cam = { x: 0, y: 0, zoom: 48, theta: Math.PI / 4 };
    const w = screenToWorld(300, 200, cam, VP);
    const s = worldToScreen(w.x, w.y, cam, VP);
    expect(s.x).toBeCloseTo(300);
    expect(s.y).toBeCloseTo(200);
    // dragging right moves the camera left-down along the rotated axis
    const p = panBy(cam, 48, 0);
    expect(p.x).toBeCloseTo(-Math.SQRT1_2);
    expect(p.y).toBeCloseTo(Math.SQRT1_2);
  });
});

describe("camera controller", () => {
  it("applies pan intents to the store camera", () => {
    const { store, bus } = rig();
    bus.dispatch({ type: "camera.pan", source: "touch", delta: { x: 48, y: 0 } });
    expect(store.getState().camera.x).toBeCloseTo(-1);
  });

  it("applies zoom intents with origin anchoring", () => {
    const { store, bus } = rig();
    bus.dispatch({
      type: "camera.zoom",
      source: "touch",
      delta: 2,
      origin: { x: 1000, y: 600 },
    });
    expect(store.getState().camera.zoom).toBe(96);
  });

  it("node.activate focuses the node and tweens the camera onto it", () => {
    const { store, bus, advance } = rig();
    const node = store.getState().addNode({
      kind: "server",
      title: "srv",
      position: { x: 100, y: 50 },
    });
    bus.dispatch({ type: "node.activate", source: "touch", id: node.id });
    expect(store.getState().focusedNodeId).toBe(node.id);
    advance(100);
    expect(store.getState().camera.x).toBeCloseTo(100);
    expect(store.getState().camera.y).toBeCloseTo(50);
  });

  it("camera.focus with no id clears focus", () => {
    const { store, bus } = rig();
    const node = store.getState().addNode({ kind: "agent", title: "a" });
    bus.dispatch({ type: "node.activate", source: "touch", id: node.id });
    bus.dispatch({ type: "camera.focus", source: "touch", id: undefined });
    expect(store.getState().focusedNodeId).toBeNull();
  });

  it("pan cancels an in-flight tween", () => {
    const { store, bus, frames, advance } = rig();
    const node = store.getState().addNode({
      kind: "server",
      title: "srv",
      position: { x: 90, y: 0 },
    });
    bus.dispatch({ type: "node.activate", source: "touch", id: node.id });
    advance(100); // one tween step
    bus.dispatch({ type: "camera.pan", source: "touch", delta: { x: 48, y: 0 } });
    const xAfterPan = store.getState().camera.x;
    for (const f of frames.splice(0)) f();
    expect(store.getState().camera.x).toBeCloseTo(xAfterPan);
  });
});
