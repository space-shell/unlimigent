# Layout regression tests — gateway nodes must never overlap, and stale
# persisted positions must self-heal on snapshot (device regression
# 2026-09-14: old user:// graph kept a cramped layout across releases).
extends GdUnitTestSuite


func _layout_size(kind: String) -> float:
	return float(GraphProjection.LAYOUT_SIZE.get(kind, 1.2))


func _assert_no_overlap(graph: Graph) -> void:
	var ids: Array = graph.nodes.keys()
	for i in range(ids.size()):
		for j in range(i + 1, ids.size()):
			var a: Dictionary = graph.nodes[ids[i]]
			var b: Dictionary = graph.nodes[ids[j]]
			var pa: Dictionary = a.position
			var pb: Dictionary = b.position
			var dist := Vector2(float(pa.x), float(pa.y)).distance_to(
				Vector2(float(pb.x), float(pb.y))
			)
			var required: float = (
				(_layout_size(a.kind) + _layout_size(b.kind)) / 2.0
				+ GraphProjection.LAYOUT_CLEARANCE
			)
			if dist < required:
				print(
					(
						"OVERLAP %s(%s)@%s vs %s(%s)@%s dist=%.3f need=%.3f"
						% [
							a.kind,
							a.externalId,
							a.position,
							b.kind,
							b.externalId,
							b.position,
							dist,
							required
						]
					)
				)
			assert_float(dist).is_greater_equal(required)


func test_large_scenario_never_overlaps() -> void:
	var graph := Graph.new()
	var scenario := MockGateway.large_scenario()
	GraphProjection.project(graph, Gateway.snapshot_event(scenario.snapshot))
	_assert_no_overlap(graph)


func test_default_scenario_never_overlaps() -> void:
	var graph := Graph.new()
	GraphProjection.project(graph, Gateway.snapshot_event(MockGateway.default_scenario().snapshot))
	_assert_no_overlap(graph)


func test_stale_persisted_positions_self_heal() -> void:
	var graph := Graph.new()
	# simulate an old persisted graph: everything dumped at one point
	GraphProjection.project(graph, Gateway.snapshot_event(MockGateway.default_scenario().snapshot))
	for node_id in graph.nodes.keys():
		graph.move_node(node_id, {"x": 1.0, "y": 1.0})
	# a fresh snapshot must re-layout every gateway node
	GraphProjection.project(graph, Gateway.snapshot_event(MockGateway.default_scenario().snapshot))
	var moved := 0
	for node_id in graph.nodes.keys():
		var pos: Dictionary = graph.nodes[node_id].position
		if Vector2(float(pos.x), float(pos.y)) != Vector2(1.0, 1.0):
			moved += 1
	assert_int(moved).is_equal(graph.nodes.size())
	_assert_no_overlap(graph)


func test_relayout_is_deterministic() -> void:
	var graph_a := Graph.new()
	var graph_b := Graph.new()
	var snapshot := Gateway.snapshot_event(MockGateway.large_scenario().snapshot)
	GraphProjection.project(graph_a, snapshot)
	GraphProjection.project(graph_b, snapshot)
	GraphProjection.relayout_gateway(graph_a)
	# node ids are generated (random); external ids are the stable key
	var by_external: Dictionary = {}
	for node_id in graph_b.nodes.keys():
		var node: Dictionary = graph_b.nodes[node_id]
		by_external[node.externalId] = node.position
	assert_int(by_external.size()).is_equal(graph_b.nodes.size())
	for node_id in graph_a.nodes.keys():
		var node: Dictionary = graph_a.nodes[node_id]
		var other: Variant = by_external.get(node.externalId)
		if other == null:
			continue
		assert_float(float(node.position.x)).is_equal(float(other.x))
		assert_float(float(node.position.y)).is_equal(float(other.y))


func test_server_is_central_hub() -> void:
	var graph := Graph.new()
	GraphProjection.project(graph, Gateway.snapshot_event(MockGateway.default_scenario().snapshot))
	var found := false
	for node_id in graph.nodes.keys():
		var node: Dictionary = graph.nodes[node_id]
		if node.kind == "server" and node.origin == "gateway":
			found = true
			var pos: Dictionary = node.position
			assert_float(float(pos.x)).is_equal(0.0)
			assert_float(float(pos.y)).is_equal(0.0)
	assert_bool(found).is_true()


func test_new_agent_event_relayouts() -> void:
	var graph := Graph.new()
	var scenario := MockGateway.default_scenario()
	GraphProjection.project(graph, Gateway.snapshot_event(scenario.snapshot))
	# squeeze an existing agent onto the server, then feed its update event
	var agent: Dictionary = scenario.snapshot.agents[0].duplicate(true)
	var target: Variant = null
	for node_id in graph.nodes.keys():
		if graph.nodes[node_id].externalId == agent.id:
			target = node_id
			break
	graph.move_node(target, {"x": 0.0, "y": 0.0})
	GraphProjection.project(graph, Gateway.agent_updated_event(agent))
	var pos: Dictionary = graph.nodes[target].position
	assert_float(Vector2(float(pos.x), float(pos.y)).length()).is_greater(2.0)
	_assert_no_overlap(graph)
