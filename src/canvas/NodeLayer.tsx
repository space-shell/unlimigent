import { useRef } from "react";
import { useStore } from "zustand";
import { Html } from "@react-three/drei";
import type { Runtime } from "../app/runtime";
import type { GraphNode } from "../graph/types";
import { screenDeltaToWorld, worldToScreen, type Viewport } from "./cameraMath";

const CULL_MARGIN_PX = 120;

function lodFor(zoom: number): "full" | "compact" | "dot" {
  if (zoom >= 28) return "full";
  if (zoom >= 12) return "compact";
  return "dot";
}

function subLine(node: GraphNode): string {
  switch (node.kind) {
    case "agent":
      return [node.meta.provider, node.meta.model].filter(Boolean).join(" · ") || "agent";
    case "workspace":
    case "worktree":
      return String(node.meta.branch ?? node.kind);
    case "server":
      return "daemon";
    default:
      return node.kind;
  }
}

interface DragState {
  pointerId: number;
  startX: number;
  startY: number;
  originPos: { x: number; y: number };
  moved: boolean;
  longPressFired: boolean;
  timer: ReturnType<typeof setTimeout>;
}

function NodeCard({
  node,
  lod,
  focused,
  runtime,
}: {
  node: GraphNode;
  lod: "full" | "compact" | "dot";
  focused: boolean;
  runtime: Runtime;
}) {
  const dragRef = useRef<DragState | null>(null);

  const endInteraction = () => {
    if (dragRef.current) {
      clearTimeout(dragRef.current.timer);
      dragRef.current = null;
    }
  };

  return (
    <Html
      position={[node.position.x, node.position.y, 0]}
      center
      zIndexRange={[100, 0]}
      style={{ pointerEvents: lod === "dot" ? "none" : "auto" }}
    >
      <div
        className={`node-card${focused ? " focused" : ""}`}
        data-kind={node.kind}
        data-status={node.status}
        data-lod={lod}
        onPointerDown={(e) => {
          e.stopPropagation();
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
          const timer = setTimeout(() => {
            const drag = dragRef.current;
            if (drag && !drag.moved) {
              drag.longPressFired = true;
              runtime.bus.dispatch({
                type: "node.context",
                source: "touch",
                id: node.id,
              });
            }
          }, 450);
          dragRef.current = {
            pointerId: e.pointerId,
            startX: e.clientX,
            startY: e.clientY,
            originPos: { ...node.position },
            moved: false,
            longPressFired: false,
            timer,
          };
        }}
        onPointerMove={(e) => {
          const drag = dragRef.current;
          if (!drag || e.pointerId !== drag.pointerId) return;
          e.stopPropagation();
          const dxPx = e.clientX - drag.startX;
          const dyPx = e.clientY - drag.startY;
          if (!drag.moved && Math.hypot(dxPx, dyPx) > 6) {
            drag.moved = true;
            clearTimeout(drag.timer);
            runtime.store.getState().pinNode(node.id, true);
          }
          if (drag.moved) {
            const state = runtime.store.getState();
            const d = screenDeltaToWorld(dxPx, dyPx, state.camera);
            state.moveNode(node.id, {
              x: drag.originPos.x + d.x,
              y: drag.originPos.y + d.y,
            });
          }
        }}
        onPointerUp={(e) => {
          e.stopPropagation();
          const drag = dragRef.current;
          endInteraction();
          if (drag && !drag.moved && !drag.longPressFired) {
            runtime.bus.dispatch({
              type: "node.activate",
              source: "touch",
              id: node.id,
            });
          }
        }}
        onPointerCancel={() => endInteraction()}
      >
        {lod !== "dot" && (
          <span className="node-text">
            <span className="node-title">{node.title}</span>
            {lod === "full" && <span className="node-sub">{subLine(node)}</span>}
          </span>
        )}
      </div>
    </Html>
  );
}

export function NodeLayer({
  runtime,
  viewport,
}: {
  runtime: Runtime;
  viewport: Viewport;
}) {
  const nodes = useStore(runtime.store, (s) => s.nodes);
  const camera = useStore(runtime.store, (s) => s.camera);
  const focusedNodeId = useStore(runtime.store, (s) => s.focusedNodeId);

  const lod = lodFor(camera.zoom);
  const list = Object.values(nodes).filter((n) => {
    const s = worldToScreen(n.position.x, n.position.y, camera, viewport);
    return (
      s.x > -CULL_MARGIN_PX &&
      s.x < viewport.width + CULL_MARGIN_PX &&
      s.y > -CULL_MARGIN_PX &&
      s.y < viewport.height + CULL_MARGIN_PX
    );
  });

  return (
    <>
      {list.map((node) => (
        <NodeCard
          key={node.id}
          node={node}
          lod={lod}
          focused={node.id === focusedNodeId}
          runtime={runtime}
        />
      ))}
    </>
  );
}
