import { useMemo, useRef, useState } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { Line, Text } from "@react-three/drei";
import { Shape } from "three";
import { useStore } from "zustand";
import type { Runtime } from "../app/runtime";
import type { GraphNode, NodeKind } from "../graph/types";
import { autoArrange } from "../graph/arrange";
import { ZOOM_MAX } from "../graph/store";
import { worldToScreen, type Viewport } from "./cameraMath";
import { tokens, type Token } from "../tokens";

const FONT = "/unlimigent/fonts/JetBrainsMono-Regular.ttf";

/** Plate footprint in local units (long axis along local x). */
export const PLATE_W = 4;
/** Reference zoom for LOD scaling. */
const REF_ZOOM = 48;
const SCALE_MIN = 0.55;
const SCALE_MAX = 3.2;

const HOLD_MS = 600;
const TAP_MS = 200;
const DRAG_SLOP_PX = 6;
const DOUBLE_TAP_MS = 300;
/** Every font renders at least this many screen pixels. */
const MIN_FONT_PX = 14;

/** Info nodes carry static identity (server, project, workspace, worktree)
 * and stay compact at every LOD. Content nodes carry dynamic payload (agents
 * today; schedules, integrations later) and expand with detail tiers. */
const INFO_KINDS: ReadonlySet<NodeKind> = new Set([
  "server",
  "project",
  "workspace",
  "worktree",
]);

const STATUS_TOKEN: Record<GraphNode["status"], Token> = {
  idle: "inkFaint",
  running: "indigo",
  attention: "ochre",
  error: "terracotta",
  done: "moss",
  archived: "plum",
};

type Lod = "dot" | "compact" | "full" | "detail";

function lodFor(zoom: number): Lod {
  if (zoom >= 90) return "detail";
  if (zoom >= 28) return "full";
  if (zoom >= 12) return "compact";
  return "dot";
}

/** World-space scale so plates stay screen-legible across zoom: they grow
 * on screen when zooming in (exponent < 1) but never vanish to specks. */
export function plateScaleFor(zoom: number): number {
  return Math.min(SCALE_MAX, Math.max(SCALE_MIN, Math.pow(REF_ZOOM / zoom, 0.5)));
}

interface TextSpec {
  plateH: number;
  titlePx: number;
  subPx: number;
  metaPx: number;
  showSub: boolean;
  showMeta: boolean;
}

const DOT_SPEC: TextSpec = {
  plateH: 0,
  titlePx: 0,
  subPx: 0,
  metaPx: 0,
  showSub: false,
  showMeta: false,
};

const CONTENT_SPEC: Record<Lod, TextSpec> = {
  dot: DOT_SPEC,
  compact: { plateH: 1.1, titlePx: 14, subPx: 14, metaPx: 14, showSub: false, showMeta: false },
  full: { plateH: 1.7, titlePx: 16, subPx: 14, metaPx: 14, showSub: true, showMeta: false },
  detail: { plateH: 3.6, titlePx: 17, subPx: 14, metaPx: 14, showSub: true, showMeta: true },
};

const INFO_SPEC: Record<Lod, TextSpec> = {
  dot: DOT_SPEC,
  compact: { plateH: 0.8, titlePx: 14, subPx: 14, metaPx: 14, showSub: false, showMeta: false },
  full: { plateH: 1.05, titlePx: 15, subPx: 14, metaPx: 14, showSub: true, showMeta: false },
  detail: { plateH: 1.15, titlePx: 15, subPx: 14, metaPx: 14, showSub: true, showMeta: false },
};

const CHAR_W = 0.62; // monospace advance ≈ 0.62em
const trunc = (s: string, max: number) => (s.length > max ? `${s.slice(0, Math.max(1, max - 1))}…` : s);

function subLine(node: GraphNode): string {
  switch (node.kind) {
    case "agent":
      return [node.meta.provider, node.meta.model].filter(Boolean).join(" · ") || "agent";
    case "workspace":
      return "Local";
    case "worktree":
      return String(node.meta.worktree ?? node.meta.branch ?? "worktree");
    case "project":
      return String(node.meta.path ?? "project");
    case "server":
      return "daemon";
    default:
      return node.kind;
  }
}

function metaRows(node: GraphNode): Array<[string, string]> {
  const rows: Array<[string, string]> = [];
  const push = (label: string, v: unknown) => {
    if (v !== null && v !== undefined && v !== "" && v !== false) {
      rows.push([label, String(v)]);
    }
  };
  push("branch", node.meta.branch);
  push("git", node.meta.git);
  push("pr", node.meta.pr);
  push("diff", node.meta.diff);
  push("path", node.meta.path);
  push("provider", node.meta.provider);
  push("model", node.meta.model);
  push("mode", node.meta.mode);
  push("perms", node.meta.permissions);
  push("attn", node.meta.attention);
  push("activity", node.meta.activity);
  return rows.slice(0, 8);
}

function descendantCount(store: Runtime["store"], id: string): number {
  const nodes = store.getState().nodes;
  let n = 0;
  const walk = (parentId: string) => {
    for (const node of Object.values(nodes) as GraphNode[]) {
      if (node.parentId === parentId) {
        n += 1;
        walk(node.id);
      }
    }
  };
  walk(id);
  return n;
}

/** Clockwise rounded-rect outline, closed, starting on the top edge. */
function outlinePoints(w: number, h: number, r: number, seg = 5): Array<[number, number]> {
  const pts: Array<[number, number]> = [];
  const arc = (cx: number, cy: number, a0: number, a1: number) => {
    for (let i = 0; i <= seg; i++) {
      const a = a0 + ((a1 - a0) * i) / seg;
      pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
    }
  };
  arc(w / 2 - r, h / 2 - r, Math.PI / 2, 0); // TR: top → right
  arc(w / 2 - r, -h / 2 + r, 0, -Math.PI / 2); // BR: right → bottom
  arc(-w / 2 + r, -h / 2 + r, -Math.PI / 2, -Math.PI); // BL: bottom → left
  arc(-w / 2 + r, h / 2 - r, Math.PI, Math.PI / 2); // TL: left → top
  pts.push([pts[0]![0], pts[0]![1]]); // close the loop
  return pts;
}

/** Rounded-rect fill shape matching the outline radius. */
function roundedRectShape(w: number, h: number, r: number): Shape {
  const s = new Shape();
  const x = -w / 2;
  const y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

/** Partial outline up to fraction t of total perimeter length. */
function partialOutline(
  pts: Array<[number, number]>,
  t: number,
): Array<[number, number, number]> {
  const lengths: number[] = [0];
  let total = 0;
  for (let i = 1; i < pts.length; i++) {
    total += Math.hypot(pts[i]![0] - pts[i - 1]![0], pts[i]![1] - pts[i - 1]![1]);
    lengths.push(total);
  }
  const target = total * Math.min(1, Math.max(0, t));
  const out: Array<[number, number, number]> = [[pts[0]![0], pts[0]![1], 0]];
  for (let i = 1; i < pts.length; i++) {
    if (lengths[i]! <= target) {
      out.push([pts[i]![0], pts[i]![1], 0]);
    } else {
      const segLen = lengths[i]! - lengths[i - 1]!;
      const f = segLen > 0 ? (target - lengths[i - 1]!) / segLen : 0;
      const x = pts[i - 1]![0] + (pts[i]![0] - pts[i - 1]![0]) * f;
      const y = pts[i - 1]![1] + (pts[i]![1] - pts[i - 1]![1]) * f;
      out.push([x, y, 0]);
      break;
    }
  }
  return out;
}

interface HoldState {
  active: boolean;
  startAt: number;
  done: boolean;
}

function GroundPlate({
  node,
  lod,
  focused,
  runtime,
  zoom,
  scale,
}: {
  node: GraphNode;
  lod: Lod;
  focused: boolean;
  runtime: Runtime;
  zoom: number;
  scale: number;
}) {
  const collapsed = useStore(runtime.store, (s) => s.collapsedIds.has(node.id));
  const hiddenCount = descendantCount(runtime.store, node.id);
  const accent = tokens[STATUS_TOKEN[node.status]];
  const spec = (INFO_KINDS.has(node.kind) ? INFO_SPEC : CONTENT_SPEC)[lod];

  const holdRef = useRef<HoldState>({ active: false, startAt: 0, done: false });
  const [fill, setFill] = useState(0);
  const lastTapRef = useRef(0);
  const tapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    moved: boolean;
  } | null>(null);

  useFrame(() => {
    const hold = holdRef.current;
    if (!hold.active) {
      if (fill !== 0 && !hold.done) setFill(0);
      return;
    }
    const t = Math.min(1, (performance.now() - hold.startAt) / HOLD_MS);
    setFill(t);
    if (t >= 1 && !hold.done) {
      hold.done = true;
      hold.active = false;
      const wasCollapsed = collapsed;
      runtime.store.getState().toggleCollapsed(node.id);
      // expansion re-flows the graph
      if (wasCollapsed) void autoArrange(runtime.store);
      setFill(0);
    }
  });

  const cancelHold = () => {
    holdRef.current.active = false;
    holdRef.current.done = false;
  };

  const cancelTapTimer = () => {
    if (tapTimerRef.current !== null) {
      clearTimeout(tapTimerRef.current);
      tapTimerRef.current = null;
    }
  };

  const endDrag = () => {
    const drag = dragRef.current;
    dragRef.current = null;
    return drag;
  };

  const onDown = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    if (e.nativeEvent.button !== undefined && e.nativeEvent.button !== 0) return;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    holdRef.current = { active: true, startAt: performance.now(), done: false };
    dragRef.current = {
      pointerId: e.pointerId,
      startX: e.nativeEvent.clientX,
      startY: e.nativeEvent.clientY,
      moved: false,
    };
  };

  const onMove = (e: ThreeEvent<PointerEvent>) => {
    const drag = dragRef.current;
    if (!drag || e.pointerId !== drag.pointerId) return;
    e.stopPropagation();
    // drags on a node are inert — the gesture is reserved for child creation
    if (
      !drag.moved &&
      Math.hypot(e.nativeEvent.clientX - drag.startX, e.nativeEvent.clientY - drag.startY) > DRAG_SLOP_PX
    ) {
      drag.moved = true;
      cancelHold();
    }
  };

  const onUp = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    const hold = holdRef.current;
    const elapsed = performance.now() - hold.startAt;
    const completedHold = hold.done;
    cancelHold();
    const drag = endDrag();
    if (drag && !drag.moved && !completedHold && elapsed < TAP_MS) {
      const now = performance.now();
      if (now - lastTapRef.current < DOUBLE_TAP_MS) {
        // double tap: cancel the pending single-tap activation and zoom
        // until the plate fills the screen (bounded)
        lastTapRef.current = 0;
        cancelTapTimer();
        const minDim = Math.min(
          globalThis.innerWidth ?? 800,
          globalThis.innerHeight ?? 600,
        );
        const target = (0.85 * minDim) / PLATE_W;
        const zoomTo = Math.min(ZOOM_MAX, Math.round((target * target) / REF_ZOOM));
        runtime.bus.dispatch({
          type: "camera.teleport",
          source: "touch",
          target: { x: node.position.x, y: node.position.y },
          zoom: zoomTo,
        });
      } else {
        // single tap (delayed so a second tap can cancel the focus tween —
        // otherwise the tween moves the plate out from under the finger)
        lastTapRef.current = now;
        cancelTapTimer();
        tapTimerRef.current = setTimeout(() => {
          tapTimerRef.current = null;
          runtime.bus.dispatch({ type: "node.activate", source: "touch", id: node.id });
        }, DOUBLE_TAP_MS);
      }
    }
    setFill(0);
  };

  const bind = {
    onPointerDown: onDown,
    onPointerMove: onMove,
    onPointerUp: onUp,
    onPointerCancel: () => {
      cancelHold();
      endDrag();
    },
  };

  // ---- dot LOD: bare node dot + invisible hit disc ----
  if (lod === "dot") {
    return (
      <group {...bind}>
        <mesh>
          <circleGeometry args={[0.22, 16]} />
          <meshBasicMaterial color={tokens.ink} />
        </mesh>
        <mesh>
          <circleGeometry args={[0.9, 8]} />
          <meshBasicMaterial visible={false} />
        </mesh>
      </group>
    );
  }

  const h = spec.plateH;
  const borderW = PLATE_W + (focused ? 0.22 : 0.1);
  const borderH = h + (focused ? 0.22 : 0.1);
  const pad = 0.28;

  // fonts target constant screen sizes (px), floored at MIN_FONT_PX
  const pxToWorld = (px: number) => {
    const v = Math.max(MIN_FONT_PX, px) / Math.max(1, zoom * scale);
    return Math.round(v * 1000) / 1000;
  };
  const titleWorld = pxToWorld(spec.titlePx);
  const subWorld = pxToWorld(spec.subPx);
  const metaWorld = pxToWorld(spec.metaPx);

  const titleChars = Math.floor((PLATE_W - pad * 2 - 0.35) / (titleWorld * CHAR_W));
  const subChars = Math.floor((PLATE_W - pad * 2) / (subWorld * CHAR_W));
  const metaChars = Math.floor((PLATE_W - pad * 2) / (metaWorld * CHAR_W));

  const titleTop = h / 2 - 0.14;
  const subTop = titleTop - titleWorld * 1.2 - 0.04;
  const metaTop = spec.showSub ? subTop - subWorld * 1.2 - 0.08 : titleTop - titleWorld * 1.2 - 0.08;

  const outline = outlinePoints(borderW, borderH, 0.18);
  const fillShape = useMemo(
    () => roundedRectShape(PLATE_W, h, 0.18),
    [h],
  );

  // collapsed stack: up to 5 card outlines beneath, 3 opaque + 2 fading
  const stackCount = collapsed ? Math.min(5, hiddenCount) : 0;
  const stackOffsets = [0.28, 0.56, 0.84, 1.12, 1.4];
  const stackOpacity = [1, 1, 1, 0.5, 0.25];

  const detailRows = spec.showMeta ? metaRows(node) : [];

  return (
    <group rotation={[0, 0, Math.PI / 2]} {...bind}>
      {/* collapsed stack beneath */}
      {stackCount > 0 &&
        stackOffsets.slice(0, stackCount).map((off, i) => (
          <Line
            key={`stack-${i}`}
            points={outlinePoints(PLATE_W + 0.1, h + 0.1, 0.18).map(
              ([x, y]) => [x, y - off, -0.02 - i * 0.001] as [number, number, number],
            )}
            color={tokens.inkFaint}
            lineWidth={1}
            opacity={stackOpacity[i] ?? 0.25}
            transparent
          />
        ))}
      {/* hairline border (closed loop) */}
      <Line
        points={outline.map(([x, y]) => [x, y, -0.01] as [number, number, number])}
        color={focused ? accent : tokens.inkFaint}
        lineWidth={focused ? 3 : 2}
      />
      {/* opaque paper fill (rounded to match the border) */}
      <mesh position={[0, 0, -0.005]}>
        <shapeGeometry args={[fillShape]} />
        <meshBasicMaterial color={tokens.paper} />
      </mesh>
      {/* hold-to-collapse: offset outline filling clockwise */}
      {fill > 0 && fill < 1 && (
        <Line points={partialOutline(outline, fill)} color={accent} lineWidth={3} />
      )}
      {spec.titlePx > 0 && (
        <Text
          font={FONT}
          fontSize={titleWorld}
          color={tokens.ink}
          anchorX="left"
          anchorY="top"
          position={[-PLATE_W / 2 + pad, titleTop, 0.002]}
        >
          {trunc(node.title, titleChars)}
        </Text>
      )}
      {spec.showSub && spec.subPx > 0 && (
        <Text
          font={FONT}
          fontSize={subWorld}
          color={tokens.ink}
          anchorX="left"
          anchorY="top"
          position={[-PLATE_W / 2 + pad, subTop, 0.002]}
        >
          {trunc(subLine(node), subChars)}
        </Text>
      )}
      {detailRows.length > 0 && (
        <Text
          font={FONT}
          fontSize={metaWorld}
          color={tokens.ink}
          anchorX="left"
          anchorY="top"
          lineHeight={1.35}
          position={[-PLATE_W / 2 + pad, metaTop, 0.002]}
        >
          {detailRows.map(([k, v]) => `${k} ${trunc(v, metaChars - k.length - 1)}`).join("\n")}
        </Text>
      )}
    </group>
  );
}

export function GroundNodes({ runtime, viewport }: { runtime: Runtime; viewport: Viewport }) {
  const nodes = useStore(runtime.store, (s) => s.nodes);
  const camera = useStore(runtime.store, (s) => s.camera);
  const focusedNodeId = useStore(runtime.store, (s) => s.focusedNodeId);
  const collapsedIds = useStore(runtime.store, (s) => s.collapsedIds);

  const state = runtime.store.getState();
  const hidden = new Set<string>();
  for (const id of collapsedIds) {
    for (const node of Object.values(nodes) as GraphNode[]) {
      if (node.id !== id && state.isDescendantOf(node.id, id)) hidden.add(node.id);
    }
  }

  const lod = lodFor(camera.zoom);
  const scale = plateScaleFor(camera.zoom);
  const margin = 280;
  const list = (Object.values(nodes) as GraphNode[]).filter((n) => {
    if (hidden.has(n.id)) return false;
    const s = worldToScreen(n.position.x, n.position.y, camera, viewport);
    return (
      s.x > -margin && s.x < viewport.width + margin &&
      s.y > -margin && s.y < viewport.height + margin
    );
  });

  return (
    <>
      {list.map((node) => (
        <group
          key={node.id}
          position={[node.position.x, node.position.y, 0]}
          scale={[scale, scale, 1]}
        >
          <GroundPlate
            node={node}
            lod={lod}
            focused={node.id === focusedNodeId}
            runtime={runtime}
            zoom={camera.zoom}
            scale={scale}
          />
        </group>
      ))}
    </>
  );
}
