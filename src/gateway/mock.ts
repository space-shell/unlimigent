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
        title: "spatial canvas foundations",
        projectId: "prj_unlimigent",
        projectDisplayName: "unlimigent",
        workspaceKind: "local_checkout",
        branch: "main",
        remoteUrl: "git@github.com:space-shell/unlimigent.git",
        pullRequest: null,
        status: "active",
      },
      {
        id: "wks_voice",
        title: "voice command interpretation",
        projectId: "prj_unlimigent",
        projectDisplayName: "unlimigent",
        workspaceKind: "worktree",
        branch: "voice-commands",
        remoteUrl: "git@github.com:space-shell/unlimigent.git",
        pullRequest: { title: "voice: intent mapping", state: "open" },
        status: "active",
      },
      {
        id: "wks_xagent",
        title: "xagent refactor",
        projectId: "prj_xagent",
        projectDisplayName: "xagent",
        workspaceKind: "local_checkout",
        branch: "main",
        remoteUrl: "git@github.com:space-shell/xagent.git",
        pullRequest: null,
        status: "active",
      },
    ],
    agents: [
      {
        id: "agt_opencode_main",
        provider: "opencode",
        model: "glm-5.3",
        cwd: "/home/jamesnicholls/projects/unlimigent",
        workspaceId: "wks_unlimigent",
        status: "running",
        title: "stage 1 graph core",
      },
      {
        id: "agt_codex_voice",
        provider: "codex",
        model: "gpt-5.5",
        cwd: "/home/jamesnicholls/projects/unlimigent/.worktrees/voice",
        workspaceId: "wks_voice",
        status: "attention",
        title: "voice prompt drafts",
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
 * (20+ nodes as project-root + worktree pairs, one agent flapping). */
export function largeScenario(projectCount = 12): MockScenario {
  const workspaces: GatewayWorkspace[] = [];
  const agents: GatewayAgent[] = [];
  for (let p = 0; p < projectCount; p++) {
    workspaces.push({
      id: `wks_large_root_${p}`,
      title: `feature ${p}`,
      projectId: `prj_large_${p}`,
      projectDisplayName: `proj-${p}`,
      workspaceKind: "local_checkout",
      branch: "main",
      remoteUrl: "git@github.com:space-shell/unlimigent.git",
      pullRequest: null,
      status: "active",
    });
    workspaces.push({
      id: `wks_large_wt_${p}`,
      title: `feature ${p} · spike`,
      projectId: `prj_large_${p}`,
      projectDisplayName: `proj-${p}`,
      workspaceKind: "worktree",
      branch: `feat-${p}`,
      remoteUrl: "git@github.com:space-shell/unlimigent.git",
      pullRequest: p % 4 === 0 ? { title: `pr ${p}`, state: "open" } : null,
      status: "active",
    });
    if (p % 2 === 0) {
      agents.push({
        id: `agt_large_${p}`,
        provider: p % 4 === 0 ? "opencode" : "codex",
        model: p % 4 === 0 ? "glm-5.3" : "gpt-5.5",
        cwd: `/w/${p}`,
        workspaceId: p % 3 === 0 ? `wks_large_wt_${p}` : `wks_large_root_${p}`,
        status: p % 6 === 0 ? "attention" : "running",
        title: `task ${p}`,
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
  private tickIndex = 0;
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
    const events = scenario.script(this.snapshot);
    for (const event of events) this.emit(event);
    this.tickIndex += 1;
  }

  private emit(event: GatewayEvent): void {
    for (const listener of this.listeners) listener(event);
  }
}

export type { GatewayWorkspace };
