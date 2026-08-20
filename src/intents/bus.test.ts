import { describe, expect, it, vi } from "vitest";
import { IntentBus } from "./bus";

describe("intent bus", () => {
  it("delivers typed intents to matching handlers only", () => {
    const bus = new IntentBus();
    const zoom = vi.fn();
    const activate = vi.fn();
    bus.on("camera.zoom", zoom);
    bus.on("node.activate", activate);

    bus.dispatch({ type: "camera.zoom", source: "gamepad", delta: -1 });
    expect(zoom).toHaveBeenCalledOnce();
    expect(activate).not.toHaveBeenCalled();
  });

  it("onAny sees every intent", () => {
    const bus = new IntentBus();
    const any = vi.fn();
    bus.onAny(any);
    bus.dispatch({ type: "ui.menu", source: "touch" });
    bus.dispatch({ type: "nav.back", source: "voice" });
    expect(any).toHaveBeenCalledTimes(2);
  });

  it("unsubscribe stops delivery", () => {
    const bus = new IntentBus();
    const h = vi.fn();
    const off = bus.on("ui.menu", h);
    off();
    bus.dispatch({ type: "ui.menu", source: "touch" });
    expect(h).not.toHaveBeenCalled();
  });

  it("keeps a bounded recent log", () => {
    const bus = new IntentBus();
    for (let i = 0; i < 250; i++) {
      bus.dispatch({ type: "ui.back", source: "system" });
    }
    expect(bus.recent()).toHaveLength(200);
  });
});
