import type { GraphStore } from "../graph/store";
import type { IntentBus } from "../intents/bus";
import type { Intent } from "../intents/types";
import { panBy, zoomAt, type Viewport } from "./cameraMath";

const TWEEN_MS = 320;

export interface CameraControllerOptions {
  getViewport: () => Viewport;
  requestAnimationFrame?: (cb: (t: number) => void) => number;
  cancelAnimationFrame?: (handle: number) => void;
  ease?: (t: number) => number;
  now?: () => number;
}

const easeInOutCubic = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

/** Applies camera/nav intents to the graph store. The three.js camera is a
 * dumb consumer of store camera state — all decisions happen here. */
export class CameraController {
  private off: Array<() => void> = [];
  private tweenHandle: number | null = null;
  private readonly raf: (cb: (t: number) => void) => number;
  private readonly caf: (handle: number) => void;
  private readonly ease: (t: number) => number;
  private readonly now: () => number;

  constructor(
    private store: GraphStore,
    private bus: IntentBus,
    private options: CameraControllerOptions,
  ) {
    this.raf = options.requestAnimationFrame ?? ((cb) => globalThis.requestAnimationFrame(cb));
    this.caf = options.cancelAnimationFrame ?? ((h) => globalThis.cancelAnimationFrame(h));
    this.ease = options.ease ?? easeInOutCubic;
    this.now = options.now ?? (() => performance.now());
  }

  attach(): void {
    this.off = [
      this.bus.on("camera.pan", (i) => this.onIntent(i)),
      this.bus.on("camera.zoom", (i) => this.onIntent(i)),
      this.bus.on("camera.teleport", (i) => this.onIntent(i)),
      this.bus.on("camera.focus", (i) => this.onIntent(i)),
      this.bus.on("node.activate", (i) => this.onIntent(i)),
      this.bus.on("node.context", (i) => this.onIntent(i)),
    ];
  }

  detach(): void {
    for (const off of this.off) off();
    this.off = [];
    this.cancelTween();
  }

  private onIntent(intent: Intent): void {
    const state = this.store.getState();
    switch (intent.type) {
      case "camera.pan":
        this.cancelTween();
        state.setCamera(panBy(state.camera, intent.delta.x, intent.delta.y));
        break;
      case "camera.zoom":
        this.cancelTween();
        state.setCamera(
          zoomAt(state.camera, intent.delta, intent.origin ?? null, this.options.getViewport()),
        );
        break;
      case "camera.teleport":
        // smooth, not instant — the ease-in-out tween covers position and
        // (log-interpolated) zoom, so double-tap zoom in/out glides
        this.tweenTo({ x: intent.target.x, y: intent.target.y, zoom: intent.zoom });
        break;
      case "camera.focus":
        if (intent.id === undefined) {
          state.focus(null);
        } else if (intent.id) {
          this.focusNode(intent.id);
        } else if (state.focusedNodeId) {
          this.focusNode(state.focusedNodeId);
        }
        break;
      case "node.activate":
        if (intent.id) this.focusNode(intent.id);
        break;
      case "node.context":
        if (intent.id) state.focus(intent.id);
        break;
    }
  }

  private focusNode(id: string): void {
    const state = this.store.getState();
    const node = state.nodes[id];
    if (!node) return;
    state.focus(id);
    this.tweenTo({ x: node.position.x, y: node.position.y });
  }

  private tweenTo(target: { x: number; y: number; zoom?: number }): void {
    this.cancelTween();
    const start = { ...this.store.getState().camera };
    const dx = target.x - start.x;
    const dy = target.y - start.y;
    const targetZoom = target.zoom ?? start.zoom;
    const zoomFrom = Math.log(start.zoom);
    const zoomTo = Math.log(targetZoom);
    if (dx === 0 && dy === 0 && targetZoom === start.zoom) return;
    const t0 = this.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - t0) / TWEEN_MS);
      const e = this.ease(t);
      this.store.getState().setCamera({
        x: start.x + dx * e,
        y: start.y + dy * e,
        zoom: Math.exp(zoomFrom + (zoomTo - zoomFrom) * e),
      });
      this.tweenHandle = t < 1 ? this.raf(step) : null;
    };
    this.tweenHandle = this.raf(step);
  }

  private cancelTween(): void {
    if (this.tweenHandle !== null) {
      this.caf(this.tweenHandle);
      this.tweenHandle = null;
    }
  }
}
