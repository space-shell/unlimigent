# Gateway data tests — raw daemon payload normalization (Spike Gb captured
# shapes) and mock scenario scripts.
extends GdUnitTestSuite


func test_normalize_agent_from_raw_capture() -> void:
	var raw := {
		"id": "c521b946-bb19-4158-ada3-94acb28791a2",
		"provider": "opencode",
		"cwd": "/home/dev/repo",
		"workspaceId": "wks_a8fca0ebf25aab34",
		"model": "zai-coding-plan/glm-5.3",
		"runtimeInfo": {"provider": "opencode", "modeId": "build"},
		"createdAt": "2026-09-10T11:40:25.397Z",
		"updatedAt": "2026-09-11T09:34:23.955Z",
		"status": "running",
		"activeTurn": {"turnId": "opencode-turn-0", "startedAt": "2026-09-11T09:22:55.322Z"},
		"pendingPermissions": [],
		"title": "principal architect",
		"requiresAttention": false,
		"attentionReason": null,
		"archivedAt": null,
	}
	var agent := Gateway.normalize_agent(raw)
	assert_str(agent.id).is_equal(raw.id)
	assert_str(agent.status).is_equal("running")
	assert_str(agent.mode).is_equal("build")
	assert_int(agent.pendingPermissions).is_equal(0)
	assert_bool(agent.archived).is_false()
	assert_str(agent.lastActivityAt).is_equal(raw.updatedAt)


func test_normalize_agent_attention_from_pending_permissions() -> void:
	var raw := {
		"id": "a1",
		"status": "running",
		"pendingPermissions": [{"requestId": "r1"}],
		"requiresAttention": false,
		"archivedAt": null,
	}
	var agent := Gateway.normalize_agent(raw)
	assert_str(agent.status).is_equal("attention")
	assert_int(agent.pendingPermissions).is_equal(1)


func test_normalize_agent_archived() -> void:
	var raw := {
		"id": "a2",
		"status": "idle",
		"pendingPermissions": [],
		"archivedAt": "2026-09-11T00:00:00Z",
	}
	var agent := Gateway.normalize_agent(raw)
	assert_bool(agent.archived).is_true()


func test_normalize_workspace_from_raw_capture() -> void:
	var raw := {
		"id": "wks_0e4845afc2afc8d7",
		"projectId": "prj_1b98534563fb9bc7",
		"projectDisplayName": "paseo-chat",
		"workspaceDirectory": "/home/dev/paseo-chat",
		"projectRootPath": "/home/dev/paseo-chat",
		"workspaceKind": "local_checkout",
		"name": "Paseo Launcher",
		"title": "Paseo Launcher",
		"status": "done",
		"diffStat": {"additions": 1342, "deletions": 1988},
		"gitRuntime":
		{
			"currentBranch": "feat/pinned-workspace-cards",
			"remoteUrl": "git@github.com:space-shell/xagent.git",
			"isDirty": true,
			"aheadBehind": {"ahead": 2, "behind": 0},
		},
		"githubRuntime":
		{
			"pullRequest":
			{
				"number": 33,
				"title": "Pivot: pinned-workspace cards",
				"state": "open",
				"isMerged": false,
				"isDraft": true,
			}
		},
	}
	var ws := Gateway.normalize_workspace(raw)
	assert_str(ws.id).is_equal(raw.id)
	assert_str(ws.branch).is_equal("feat/pinned-workspace-cards")
	assert_bool(ws.isDirty).is_true()
	assert_int(ws.ahead).is_equal(2)
	assert_str(ws.pullRequest.state).is_equal("open")
	assert_str(ws.pullRequest.title).is_equal("Pivot: pinned-workspace cards")
	assert_str(ws.diffStat).is_equal("+1342 −1988")
	assert_str(ws.status).is_equal("done")


func test_snapshot_from_fetch_pairs_entries() -> void:
	var snapshot := (
		Gateway
		. snapshot_from_fetch(
			"jn-server",
			[{"id": "wks_1", "projectId": "prj_1", "gitRuntime": {}, "status": "active"}],
			[
				{
					"agent":
					{
						"id": "agt_1",
						"workspaceId": "wks_1",
						"status": "running",
						"pendingPermissions": [],
					}
				}
			],
		)
	)
	assert_str(snapshot.daemonHost).is_equal("jn-server")
	assert_int(snapshot.workspaces.size()).is_equal(1)
	assert_int(snapshot.agents.size()).is_equal(1)
	assert_str(snapshot.agents[0].id).is_equal("agt_1")


func test_mock_script_flaps_first_agent() -> void:
	var scenario := MockGateway.default_scenario()
	var snap: Dictionary = scenario.snapshot
	var events: Array = scenario.script.call(snap)
	assert_int(events.size()).is_equal(1)
	assert_str(events[0].kind).is_equal("agent-updated")
	assert_str(events[0].agent.status).is_equal("idle")
	var events2: Array = scenario.script.call(snap)
	assert_str(events2[0].agent.status).is_equal("running")


func test_mock_gateway_emits_and_subscribes() -> void:
	var gateway := MockGateway.new()
	var received: Array = []
	gateway.subscribe(func(event: Dictionary) -> void: received.append(event))
	gateway._emit(Gateway.connection_event("connected"))
	assert_int(received.size()).is_equal(1)
	assert_str(received[0].state).is_equal("connected")
	gateway.free()
