class_name MockGateway
extends Node
## Emits daemon-shaped events from a scripted scenario — port of
## src/gateway/mock.ts including the 38-node large perf scenario.
## Deterministic data, Timer-driven ticks.

signal event_received(event: Dictionary)

const DEFAULT_TICK_SEC := 3.0

var tick_sec := DEFAULT_TICK_SEC
var _listeners: Array[Callable] = []
var _timer: Timer
var _snapshot: Dictionary
var _script: Callable


func _init(scenario: Dictionary = {}) -> void:
	var resolved := scenario if scenario.has("snapshot") else default_scenario()
	_snapshot = resolved.snapshot.duplicate(true)
	_script = resolved.script


func start() -> void:
	if _timer != null:
		return
	_emit(Gateway.connection_event("connected"))
	_emit(Gateway.snapshot_event(_snapshot.duplicate(true)))
	_timer = Timer.new()
	_timer.wait_time = tick_sec
	_timer.timeout.connect(_tick)
	add_child(_timer)
	_timer.start()


func stop() -> void:
	if _timer == null:
		return
	_timer.queue_free()
	_timer = null
	_emit(Gateway.connection_event("disconnected"))


func subscribe(listener: Callable) -> Callable:
	_listeners.append(listener)
	var gateway := self
	return func() -> void: gateway._listeners.erase(listener)


func _tick() -> void:
	if not _script.is_valid():
		return
	for event in _script.call(_snapshot):
		_emit(event)


func _emit(event: Dictionary) -> void:
	event_received.emit(event)
	for listener in _listeners.duplicate():
		listener.call(event)


## Web default scenario (src/gateway/mock.ts DEFAULT_SCENARIO) as data.
static func default_scenario() -> Dictionary:
	var snapshot := {
		"daemonHost": "jn-server",
		"workspaces":
		[
			{
				"id": "wks_unlimigent",
				"name": "spatial canvas foundations",
				"title": null,
				"projectId": "prj_unlimigent",
				"projectDisplayName": "unlimigent",
				"workspaceKind": "local_checkout",
				"directory": "/home/jamesnicholls/projects/unlimigent",
				"projectRootPath": "/home/jamesnicholls/projects/unlimigent",
				"branch": "main",
				"remoteUrl": "git@github.com:space-shell/unlimigent.git",
				"isDirty": true,
				"ahead": 2,
				"behind": 0,
				"pullRequest": null,
				"diffStat": "+412 −38",
				"status": "active",
			},
			{
				"id": "wks_voice",
				"name": "voice command interpretation",
				"title": null,
				"projectId": "prj_unlimigent",
				"projectDisplayName": "unlimigent",
				"workspaceKind": "worktree",
				"directory": "/home/jamesnicholls/projects/unlimigent/.worktrees/voice",
				"projectRootPath": "/home/jamesnicholls/projects/unlimigent",
				"branch": "voice-commands",
				"remoteUrl": "git@github.com:space-shell/unlimigent.git",
				"isDirty": false,
				"ahead": 0,
				"behind": 1,
				"pullRequest": {"title": "voice: intent mapping", "state": "open"},
				"diffStat": "+1.2k −210",
				"status": "active",
			},
			{
				"id": "wks_xagent",
				"name": "xagent refactor",
				"title": null,
				"projectId": "prj_xagent",
				"projectDisplayName": "xagent",
				"workspaceKind": "local_checkout",
				"directory": "/home/jamesnicholls/tmp/xagent",
				"projectRootPath": "/home/jamesnicholls/tmp/xagent",
				"branch": "main",
				"remoteUrl": "git@github.com:space-shell/xagent.git",
				"isDirty": false,
				"ahead": 0,
				"behind": 0,
				"pullRequest": null,
				"diffStat": null,
				"status": "active",
			},
		],
		"agents":
		[
			{
				"id": "agt_opencode_main",
				"title": "stage 2 canvas polish",
				"provider": "opencode",
				"model": "glm-5.3",
				"cwd": "/home/jamesnicholls/projects/unlimigent",
				"workspaceId": "wks_unlimigent",
				"status": "running",
				"mode": "build",
				"requiresAttention": false,
				"attentionReason": null,
				"pendingPermissions": 0,
				"lastActivityAt": "2026-08-20T19:00:00Z",
				"archived": false,
			},
			{
				"id": "agt_codex_voice",
				"title": "voice prompt drafts",
				"provider": "codex",
				"model": "gpt-5.5",
				"cwd": "/home/jamesnicholls/projects/unlimigent/.worktrees/voice",
				"workspaceId": "wks_voice",
				"status": "attention",
				"mode": "build",
				"requiresAttention": true,
				"attentionReason": "permission request",
				"pendingPermissions": 1,
				"lastActivityAt": "2026-08-20T18:40:00Z",
				"archived": false,
			},
		],
	}
	return {"snapshot": snapshot, "script": _flap_first_agent}


## Deterministic large scenario for the device perf bar (project-root +
## worktree pairs, agents flapping for live updates). 12 projects →
## 24 workspaces + 6 agents = 30 graph nodes + server + 12 projects.
static func large_scenario(project_count: int = 12) -> Dictionary:
	var workspaces: Array = []
	var agents: Array = []
	for p: int in range(project_count):
		(
			workspaces
			. append(
				{
					"id": "wks_large_root_%d" % p,
					"name": "feature %d" % p,
					"title": null,
					"projectId": "prj_large_%d" % p,
					"projectDisplayName": "proj-%d" % p,
					"workspaceKind": "local_checkout",
					"directory": "/home/dev/proj-%d" % p,
					"projectRootPath": "/home/dev/proj-%d" % p,
					"branch": "main",
					"remoteUrl": "git@github.com:space-shell/unlimigent.git",
					"isDirty": false,
					"ahead": 0,
					"behind": 0,
					"pullRequest": null,
					"diffStat": null,
					"status": "active",
				}
			)
		)
		(
			workspaces
			. append(
				{
					"id": "wks_large_wt_%d" % p,
					"name": "feature %d spike" % p,
					"title": null,
					"projectId": "prj_large_%d" % p,
					"projectDisplayName": "proj-%d" % p,
					"workspaceKind": "worktree",
					"directory": "/home/dev/proj-%d/.worktrees/spike-%d" % [p, p],
					"projectRootPath": "/home/dev/proj-%d" % p,
					"branch": "feat-%d" % p,
					"remoteUrl": "git@github.com:space-shell/unlimigent.git",
					"isDirty": p % 3 == 0,
					"ahead": p,
					"behind": 0,
					"pullRequest": {"title": "pr %d" % p, "state": "open"} if p % 4 == 0 else null,
					"diffStat": "+%d −%d" % [100 + p * 7, p * 3],
					"status": "active",
				}
			)
		)
		if p % 2 == 0:
			(
				agents
				. append(
					{
						"id": "agt_large_%d" % p,
						"title": "task %d" % p,
						"provider": "opencode" if p % 4 == 0 else "codex",
						"model": "glm-5.3" if p % 4 == 0 else "gpt-5.5",
						"cwd": "/w/%d" % p,
						"workspaceId":
						"wks_large_wt_%d" % p if p % 3 == 0 else "wks_large_root_%d" % p,
						"status": "attention" if p % 6 == 0 else "running",
						"mode": "build",
						"requiresAttention": p % 6 == 0,
						"attentionReason": "permission request" if p % 6 == 0 else null,
						"pendingPermissions": 1 if p % 6 == 0 else 0,
						"lastActivityAt": "2026-08-20T18:00:00Z",
						"archived": false,
					}
				)
			)
	var snapshot := {"daemonHost": "jn-server", "workspaces": workspaces, "agents": agents}
	return {"snapshot": snapshot, "script": _flap_first_agent}


## Shared script: flip agents[0] between running and idle each tick.
static func _flap_first_agent(snap: Dictionary) -> Array:
	var agents: Array = snap.get("agents", [])
	if agents.is_empty():
		return []
	var agent: Dictionary = agents[0]
	var next := agent.duplicate(true)
	next.status = "idle" if agent.get("status", "") == "running" else "running"
	agents[0] = next
	return [Gateway.agent_updated_event(next)]
