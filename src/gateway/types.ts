// Gateway data shapes mirror what the daemon actually returns (spike 0a,
// @getpaseo/client 0.4.0). The graph never imports @getpaseo/client — only
// the real gateway (Stage 4) does.

export interface GatewayWorkspace {
  id: string;
  title: string;
  projectId: string;
  projectDisplayName: string;
  workspaceKind: string;
  branch: string | null;
  remoteUrl: string | null;
  pullRequest: { title: string; state: string } | null;
  status: string;
}

export interface GatewayAgent {
  id: string;
  provider: string;
  model: string;
  cwd: string;
  workspaceId: string | null;
  status: "idle" | "running" | "attention" | "error";
  title: string;
}

export interface GatewaySnapshot {
  daemonHost: string;
  workspaces: GatewayWorkspace[];
  agents: GatewayAgent[];
}

export type GatewayEvent =
  | { kind: "snapshot"; snapshot: GatewaySnapshot }
  | { kind: "workspace-updated"; workspace: GatewayWorkspace }
  | { kind: "workspace-archived"; id: string }
  | { kind: "agent-updated"; agent: GatewayAgent }
  | { kind: "agent-removed"; id: string }
  | { kind: "connection"; state: "connected" | "disconnected" | "error"; detail?: string };

export type GatewayListener = (event: GatewayEvent) => void;

export interface PaseoGateway {
  start(): void;
  stop(): void;
  subscribe(listener: GatewayListener): () => void;
}
