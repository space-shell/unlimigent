import { useRef, useState } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { Line, Text } from "@react-three/drei";
import { useStore } from "zustand";
import type { Runtime } from "../app/runtime";
import type { GraphNode } from "../graph/types";
import { autoArrange, snapToGrid } from "../graph/arrange";
import { screenDeltaToWorld, worldToScreen, type Viewport } from "./cameraMath";
import { tokens, type Token } from "../tokens";

const FONT = "/unlimigent/fonts/JetBrainsMono-Regular.ttf";

/** Plate footprint in local units (long axis along local x). */
export const PLATE_W = 4;
/** Reference zoom for LOD scaling. */
const REF_ZOOM = 48;

const HOLD_MS = 600;
const TAP_MS = 200;
const DRAG_SLOP_PX = 6;

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
  return Math.min(3.2, Math.max(0.55, Math.pow(REF_ZOOM / zoom, 0.5)));
}

interface LodSpec {
  plateH: number;
  titleFont: number;
  subFont: number;
  metaFont: number;
  showSub: boolean;
  showMeta: boolean;
}

const LOD_SPEC: Record<Lod, LodSpec> = {
  dot: { plateH: 0, titleFont: 0, subFont: 0, metaFont: 0, showSub: false, showMeta: false },
  compact: { plateH: 1.1, titleFont: 0.34, subFont: 0, metaFont: 0, showSub: false, showMeta: false },
  full: { plateH: 1.7, titleFont: 0.34, subFont: 0.24, metaFont: 0, showSub: true, showMeta: false },
  detail: { plateH: 4.4, titleFont: 0.34, subFont: 0.24, metaFont: 0.2, showSub: true, showMeta: true },
};

const CHAR_W = 0.62; // monospace advance ≈ 0.62em
const trunc = (s: string, max: number) => (s.length > max ? `${s.slice(0, Math.max(1, max - 1))}…` : s);

function subLine(node: GraphNode): string {
  switch (node.kind) {
    case "agent":
      return [node.meta.provider, node.meta.model].filter(Boolean).join(" · ") || "agent";
    case "workspace":
      return String(node.meta.path ?? node.meta.branch ?? "workspace");
    case "worktree":
      return String(node.meta.worktree ?? node.meta.branch ?? "worktree");
    case "project":
      return "project";
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

/** Clockwise rounded-rect outline, closed, starting/ending on the top edge. */
function outlinePoints(w: number, h: number, r: number, seg = 5): Array<[number, number]> {
  const ccw: Array<[number, number]> = [];
  const cornerTo = (cx: number, cy: number, a0: number, a1: number) => {
    for (let i = 0; i <= seg; i++) {
      const a = a0 + ((a1 - a0) * i) / seg;
      ccw.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
    }
  };
  cornerTo(w / 2 - r, h / 2 - r, 0, Math.PI / 2);
  cornerTo(-w / 2 + r, h / 2 - r, Math.PI / 2, Math.PI);
  cornerTo(-w / 2 + r, -h / 2 + r, Math.PI, (3 * Math.PI) / 2);
  cornerTo(w / 2 - r, -h / 2 + r, (3 * Math.PI) / 2, 2 * Math.PI);
  // start mid-top edge, run clockwise, close the loop
  const clockwise = [...ccw].reverse();
  return [[-w / 2 + r, h / 2], ...clockwise, [-w / 2 + r, h / 2]];
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
  spec,
  lod,
  focused,
  runtime,
}: {
  node: GraphNode;
  spec: LodSpec;
  lod: Lod;
  focused: boolean;
  runtime: Runtime;
}) {
  const collapsed = useStore(runtime.store, (s) => s.collapsedIds.has(node.id));
  const hiddenCount = descendantCount(runtime.store, node.id);
  const accent = tokens[STATUS_TOKEN[node.status]];

  const holdRef = useRef<HoldState>({ active: false, startAt: 0, done: false });
  const [fill, setFill] = useState(0);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    origin: { x: number; y: number };
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
      // expansion re-flows the graph (pinned nodes keep their positions)
      if (wasCollapsed) void autoArrange(runtime.store);
      setFill(0);
    }
  });

  const cancelHold = () => {
    holdRef.current.active = false;
    holdRef.current.done = false;
  };

  const endDrag = () => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (drag?.moved) {
      const p = runtime.store.getState().nodes[node.id]?.position;
      if (p) {
        runtime.store.getState().moveNode(node.id, {
          x: snapToGrid(p.x),
          y: snapToGrid(p.y),
        });
      }
    }
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
      origin: { ...node.position },
      moved: false,
    };
  };

  const onMove = (e: ThreeEvent<PointerEvent>) => {
    const drag = dragRef.current;
    if (!drag || e.pointerId !== drag.pointerId) return;
    e.stopPropagation();
    const dxPx = e.nativeEvent.clientX - drag.startX;
    const dyPx = e.nativeEvent.clientY - drag.startY;
    if (!drag.moved && Math.hypot(dxPx, dyPx) > DRAG_SLOP_PX) {
      drag.moved = true;
      cancelHold();
      runtime.store.getState().pinNode(node.id, true);
    }
    if (drag.moved) {
      const state = runtime.store.getState();
      const d = screenDeltaToWorld(dxPx, dyPx, state.camera);
      // live grid snap while dragging
      state.moveNode(node.id, {
        x: snapToGrid(drag.origin.x + d.x),
        y: snapToGrid(drag.origin.y + d.y),
      });
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
      runtime.bus.dispatch({ type: "node.activate", source: "touch", id: node.id });
    }
    setFill(0);
  };

  const pad = 0.28;

  // ---- dot LOD: bare status dot + invisible hit disc ----
  if (lod === "dot") {
    return (
      <group
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={() => {
          cancelHold();
          endDrag();
        }}
      >
        <mesh>
          <circleGeometry args={[0.22, 16]} />
          <meshBasicMaterial color={accent} />
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

  const titleChars = Math.floor((PLATE_W - pad * 2 - 0.35) / (spec.titleFont * CHAR_W));
  const subChars = Math.floor((PLATE_W - pad * 2) / (spec.subFont * CHAR_W));
  const metaChars = Math.floor((PLATE_W - pad * 2) / (spec.metaFont * CHAR_W));

  const outline = outlinePoints(borderW, borderH, 0.18);

  // collapsed stack: up to 5 card outlines beneath, 3 opaque + 2 fading
  const stackCount = collapsed ? Math.min(5, hiddenCount) : 0;
  const stackOffsets = [0.28, 0.56, 0.84, 1.12, 1.4];
  const stackOpacity = [1, 1, 1, 0.5, 0.25];

  const detailRows = spec.showMeta ? metaRows(node) : [];

  return (
    <group
      rotation={[0, 0, Math.PI / 2]}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={() => {
        cancelHold();
        endDrag();
      }}
    >
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
        lineWidth={focused ? 2 : 1}
      />
      {/* opaque paper fill */}
      <mesh position={[0, 0, -0.005]}>
        <planeGeometry args={[PLATE_W, h]} />
        <meshBasicMaterial color={tokens.paper} />
      </mesh>
      {/* status dot */}
      <mesh position={[PLATE_W / 2 - pad, h / 2 - 0.3, 0.002]}>
        <circleGeometry args={[0.11, 16]} />
        <meshBasicMaterial color={accent} />
      </mesh>
      {/* hold-to-collapse: offset outline filling clockwise */}
      {fill > 0 && fill < 1 && (
        <Line points={partialOutline(outline, fill)} color={accent} lineWidth={3} />
      )}
      {spec.titleFont > 0 && (
        <Text
          font={FONT}
          fontSize={spec.titleFont}
          color={tokens.ink}
          anchorX="left"
          anchorY="top"
          position={[-PLATE_W / 2 + pad, h / 2 - 0.16, 0.002]}
        >
          {trunc(node.title, titleChars)}
        </Text>
      )}
      {spec.showSub && spec.subFont > 0 && (
        <Text
          font={FONT}
          fontSize={spec.subFont}
          color={tokens.inkFaint}
          anchorX="left"
          anchorY="top"
          position={[-PLATE_W / 2 + pad, h / 2 - 0.62, 0.002]}
        >
          {trunc(subLine(node), subChars)}
        </Text>
      )}
      {detailRows.length > 0 && (
        <Text
          font={FONT}
          fontSize={spec.metaFont}
          color={tokens.inkFaint}
          anchorX="left"
          anchorY="top"
          lineHeight={1.35}
          position={[-PLATE_W / 2 + pad, h / 2 - 1.1, 0.002]}
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
  const spec = LOD_SPEC[lod];
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
            spec={spec}
            lod={lod}
            focused={node.id === focusedNodeId}
            runtime={runtime}
          />
        </group>
      ))}
    </>
  );
}
