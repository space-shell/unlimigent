import { useStore } from "zustand";
import type { Runtime } from "../app/runtime";
import type { GraphNode } from "../graph/types";

const KIND_LABEL: Record<GraphNode["kind"], string> = {
  server: "server",
  workspace: "workspace",
  worktree: "worktree",
  agent: "agent",
  schedule: "schedule",
  integration: "integration",
};

function subFor(node: GraphNode): string | null {
  switch (node.kind) {
    case "agent": {
      const bits = [node.meta.provider, node.meta.model, node.meta.mode]
        .filter((v) => v !== null && v !== undefined && v !== "");
      return bits.length ? bits.map(String).join(" · ") : null;
    }
    case "workspace":
      return node.meta.path ? String(node.meta.path) : node.meta.branch !== null ? String(node.meta.branch) : null;
    case "worktree":
      return node.meta.worktree !== null && node.meta.worktree !== undefined
        ? String(node.meta.worktree)
        : node.meta.branch !== null
          ? String(node.meta.branch)
          : null;
    case "server":
      return "daemon";
    default:
      return null;
  }
}

/** Bottom info bar: the focused node at a glance. */
export function InfoBar({ runtime }: { runtime: Runtime }) {
  const focusedNodeId = useStore(runtime.store, (s) => s.focusedNodeId);
  const node = useStore(runtime.store, (s) =>
    s.focusedNodeId ? s.nodes[s.focusedNodeId] : null,
  );

  if (!focusedNodeId || !node) {
    return (
      <div className="info-bar" data-empty="true">
        <span className="info-hint">tap to focus · hold to collapse · drag to arrange · pinch to zoom</span>
      </div>
    );
  }

  const meta = Object.entries(node.meta)
    .filter(([k, v]) => v !== null && v !== "" && k !== "path" && k !== "projectId")
    .slice(0, 5)
    .map(([k, v]) => `${k} ${v}`)
    .join("  ");
  const sub = subFor(node);

  return (
    <div className="info-bar">
      <span className="info-kind">{KIND_LABEL[node.kind]}</span>
      <span className="info-title">{node.title}</span>
      <span className="info-status" data-status={node.status}>
        {node.status}
      </span>
      {sub && <span className="info-meta">{sub}</span>}
      {meta && <span className="info-meta">{meta}</span>}
    </div>
  );
}
