import type { GatewayAgent, GatewayEvent, GatewayListener, GatewaySnapshot, GatewayWorkspace, PaseoGateway } from "./types";

interface MockScenario {
  snapshot: GatewaySnapshot;
  /** Scripted mutations, applied one per tick after the initial snapshot. */
  script: (snapshot: GatewaySnapshot) => GatewayEvent[];
}

const DEFAULT_SCENARIO: MockScenario = {
  snapshot: {
    daemonHost: "jn-server",
    workspaces: [
      {
        id: "wks_unlimigent",
        name: "spatial canvas foundations",
        title: null,
        projectId: "prj_unlimigent",
        projectDisplayName: "unlimigent",
        workspaceKind: "local_checkout",
        directory: "/home/jamesnicholls/projects/unlimigent",
        branch: "main",
        remoteUrl: "git@github.com:space-shell/unlimigent.git",
        isDirty: true,
        ahead: 2,
        behind: 0,
        pullRequest: null,
        diffStat: "+412 −38",
        status: "active",
      },
      {
        id: "wks_voice",
        name: "voice command interpretation",
        title: null,
        projectId: "prj_unlimigent",
        projectDisplayName: "unlimigent",
        workspaceKind: "worktree",
        directory: "/home/jamesnicholls/projects/unlimigent/.worktrees/voice",
        branch: "voice-commands",
        remoteUrl: "git@github.com:space-shell/unlimigent.git",
        isDirty: false,
        ahead: 0,
        behind: 1,
        pullRequest: { title: "voice: intent mapping", state: "open" },
        diffStat: "+1.2k −210",
        status: "active",
      },
      {
        id: "wks_xagent",
        name: "xagent refactor",
        title: null,
        projectId: "prj_xagent",
        projectDisplayName: "xagent",
        workspaceKind: "local_checkout",
        directory: "/home/jamesnicholls/tmp/xagent",
        branch: "main",
        remoteUrl: "git@github.com:space-shell/xagent.git",
        isDirty: false,
        ahead: 0,
        behind: 0,
        pullRequest: null,
        diffStat: null,
        status: "active",
      },
    ],
    agents: [
      {
        id: "agt_opencode_main",
        title: "stage 2 canvas polish",
        provider: "opencode",
        model: "glm-5.3",
        cwd: "/home/jamesnicholls/projects/unlimigent",
        workspaceId: "wks_unlimigent",
        status: "running",
        mode: "build",
        requiresAttention: false,
        attentionReason: null,
        pendingPermissions: 0,
        lastActivityAt: "2026-08-20T19:00:00Z",
        archived: false,
      },
      {
        id: "agt_codex_voice",
        title: "voice prompt drafts",
        provider: "codex",
        model: "gpt-5.5",
        cwd: "/home/jamesnicholls/projects/unlimigent/.worktrees/voice",
        workspaceId: "wks_voice",
        status: "attention",
        mode: "build",
        requiresAttention: true,
        attentionReason: "permission request",
        pendingPermissions: 1,
        lastActivityAt: "2026-08-20T18:40:00Z",
        archived: false,
      },
    ],
  },
  script: (snap) => {
    const agent = snap.agents[0];
    if (!agent) return [];
    const next: GatewayAgent =
      agent.status === "running"
        ? { ...agent, status: "idle" }
        : { ...agent, status: "running" };
    snap.agents[0] = next;
    return [{ kind: "agent-updated", agent: next }];
  },
};

export interface MockPaseoGatewayOptions {
  tickMs?: number;
  scenario?: MockScenario;
  clock?: {
    setInterval: (fn: () => void, ms: number) => unknown;
    clearInterval: (handle: unknown) => void;
  };
}

/** Deterministic large scenario for the Stage 2 device perf bar
 * (project-root + worktree pairs, agents flapping for live updates). */
export function largeScenario(projectCount = 12): MockScenario {
  const workspaces: GatewayWorkspace[] = [];
  const agents: GatewayAgent[] = [];
  for (let p = 0; p < projectCount; p++) {
    workspaces.push({
      id: `wks_large_root_${p}`,
      name: `feature ${p}`,
      title: null,
      projectId: `prj_large_${p}`,
      projectDisplayName: `proj-${p}`,
      workspaceKind: "local_checkout",
      directory: `/home/dev/proj-${p}`,
      branch: "main",
      remoteUrl: "git@github.com:space-shell/unlimigent.git",
      isDirty: false,
      ahead: 0,
      behind: 0,
      pullRequest: null,
      diffStat: null,
      status: "active",
    });
    workspaces.push({
      id: `wks_large_wt_${p}`,
      name: `feature ${p} spike`,
      title: null,
      projectId: `prj_large_${p}`,
      projectDisplayName: `proj-${p}`,
      workspaceKind: "worktree",
      directory: `/home/dev/proj-${p}/.worktrees/spike-${p}`,
      branch: `feat-${p}`,
      remoteUrl: "git@github.com:space-shell/unlimigent.git",
      isDirty: p % 3 === 0,
      ahead: p,
      behind: 0,
      pullRequest: p % 4 === 0 ? { title: `pr ${p}`, state: "open" } : null,
      diffStat: `+${100 + p * 7} −${p * 3}`,
      status: "active",
    });
    if (p % 2 === 0) {
      agents.push({
        id: `agt_large_${p}`,
        title: `task ${p}`,
        provider: p % 4 === 0 ? "opencode" : "codex",
        model: p % 4 === 0 ? "glm-5.3" : "gpt-5.5",
        cwd: `/w/${p}`,
        workspaceId: p % 3 === 0 ? `wks_large_wt_${p}` : `wks_large_root_${p}`,
        status: p % 6 === 0 ? "attention" : "running",
        mode: "build",
        requiresAttention: p % 6 === 0,
        attentionReason: p % 6 === 0 ? "permission request" : null,
        pendingPermissions: p % 6 === 0 ? 1 : 0,
        lastActivityAt: "2026-08-20T18:00:00Z",
        archived: false,
      });
    }
  }
  const snapshot: GatewaySnapshot = {
    daemonHost: "jn-server",
    workspaces,
    agents,
  };
  return {
    snapshot,
    script: (snap) => {
      const agent = snap.agents[0];
      if (!agent) return [];
      const next: GatewayAgent =
        agent.status === "running"
          ? { ...agent, status: "idle" }
          : { ...agent, status: "running" };
      snap.agents[0] = next;
      return [{ kind: "agent-updated", agent: next }];
    },
  };
}

/** Emits daemon-shaped events from a scripted scenario. Deterministic with an
 * injected clock; drifts realistically with the default wall clock. */
export class MockPaseoGateway implements PaseoGateway {
  private listeners = new Set<GatewayListener>();
  private handle: unknown = null;
  private readonly options: Required<Pick<MockPaseoGatewayOptions, "tickMs">> &
    MockPaseoGatewayOptions;
  private snapshot: GatewaySnapshot;

  constructor(options: MockPaseoGatewayOptions = {}) {
    this.options = {
      tickMs: options.tickMs ?? 3000,
      scenario: options.scenario ?? DEFAULT_SCENARIO,
      clock: options.clock ?? {
        setInterval: (fn, ms) => globalThis.setInterval(fn, ms),
        clearInterval: (h) => globalThis.clearInterval(h as number),
      },
    };
    this.snapshot = structuredClone(this.options.scenario!.snapshot);
  }

  start(): void {
    if (this.handle !== null) return;
    this.emit({ kind: "connection", state: "connected" });
    this.emit({ kind: "snapshot", snapshot: structuredClone(this.snapshot) });
    this.handle = this.options.clock!.setInterval(() => this.tick(), this.options.tickMs);
  }

  stop(): void {
    if (this.handle === null) return;
    this.options.clock!.clearInterval(this.handle);
    this.handle = null;
    this.emit({ kind: "connection", state: "disconnected" });
  }

  subscribe(listener: GatewayListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private tick(): void {
    const scenario = this.options.scenario!;
    for (const event of scenario.script(this.snapshot)) this.emit(event);
  }

  private emit(event: GatewayEvent): void {
    for (const listener of this.listeners) listener(event);
  }
}

export type { GatewayWorkspace };
