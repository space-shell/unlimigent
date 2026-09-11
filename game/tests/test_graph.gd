# Graph core tests — 1:1 port of src/graph/store.test.ts semantics.
extends GdUnitTestSuite


func test_add_node_with_parent_creates_contains_edge() -> void:
	var graph := Graph.new()
	var server := graph.add_node({"kind": "server", "title": "host"})
	var project := graph.add_node({"kind": "project", "title": "p", "parentId": server.id})
	assert_int(graph.nodes.size()).is_equal(2)
	assert_int(graph.edges.size()).is_equal(1)
	var edge: Dictionary = graph.edges.values()[0]
	assert_str(edge.kind).is_equal("contains")
	assert_str(edge.from).is_equal(server.id)
	assert_str(edge.to).is_equal(project.id)


func test_add_node_missing_parent_no_edge() -> void:
	var graph := Graph.new()
	graph.add_node({"kind": "project", "title": "p", "parentId": "nope"})
	assert_int(graph.edges.size()).is_equal(0)


func test_connect_dedupes() -> void:
	var graph := Graph.new()
	var a := graph.add_node({"kind": "server", "title": "a"})
	var b := graph.add_node({"kind": "project", "title": "b"})
	var e1: Variant = graph.connect_nodes(a.id, b.id, "links")
	var e2: Variant = graph.connect_nodes(a.id, b.id, "links")
	assert_int(graph.edges.size()).is_equal(1)
	assert_str((e1 as Dictionary).id).is_equal((e2 as Dictionary).id)


func test_connect_rejects_self_and_missing() -> void:
	var graph := Graph.new()
	var a := graph.add_node({"kind": "server", "title": "a"})
	assert_that(graph.connect_nodes(a.id, a.id, "links")).is_null()
	assert_that(graph.connect_nodes(a.id, "missing", "links")).is_null()


func test_remove_node_cleans_edges_orphans_children_and_focus() -> void:
	var graph := Graph.new()
	var server := graph.add_node({"kind": "server", "title": "s"})
	var project := graph.add_node({"kind": "project", "title": "p", "parentId": server.id})
	graph.focus(project.id)
	assert_that(graph.focused_node_id).is_equal(project.id)
	graph.remove_node(server.id)
	assert_that(graph.nodes[project.id].parentId).is_null()
	assert_int(graph.edges.size()).is_equal(0)
	# focus survives removing a non-focused node…
	assert_that(graph.focused_node_id).is_equal(project.id)
	# …and clears when the focused node itself goes away
	graph.remove_node(project.id)
	assert_that(graph.focused_node_id).is_null()


func test_reparent_swaps_contains_edge() -> void:
	var graph := Graph.new()
	var server := graph.add_node({"kind": "server", "title": "s"})
	var p1 := graph.add_node({"kind": "project", "title": "p1", "parentId": server.id})
	var p2 := graph.add_node({"kind": "project", "title": "p2", "parentId": server.id})
	var ws := graph.add_node({"kind": "workspace", "title": "w", "parentId": p1.id})
	assert_bool(graph.reparent(ws.id, p2.id)).is_true()
	assert_that(graph.nodes[ws.id].parentId).is_equal(p2.id)
	var contains_count := 0
	for edge in graph.edges.values():
		if edge.kind == "contains" and edge.to == ws.id:
			contains_count += 1
	assert_int(contains_count).is_equal(1)
	assert_bool(graph.reparent(ws.id, p2.id)).is_false()
	assert_bool(graph.reparent(ws.id, "missing")).is_false()


func test_collapse_hides_descendants() -> void:
	var graph := Graph.new()
	var server := graph.add_node({"kind": "server", "title": "s"})
	var project := graph.add_node({"kind": "project", "title": "p", "parentId": server.id})
	var ws := graph.add_node({"kind": "workspace", "title": "w", "parentId": project.id})
	assert_bool(graph.is_hidden_by_collapse(ws.id)).is_false()
	graph.toggle_collapsed(project.id)
	assert_bool(graph.is_hidden_by_collapse(ws.id)).is_true()
	assert_bool(graph.is_hidden_by_collapse(project.id)).is_false()
	graph.toggle_collapsed(project.id)
	assert_bool(graph.is_hidden_by_collapse(ws.id)).is_false()


func test_is_descendant_of_handles_cycles() -> void:
	var graph := Graph.new()
	var a := graph.add_node({"kind": "server", "title": "a"})
	var b := graph.add_node({"kind": "project", "title": "b", "parentId": a.id})
	# fabricate a cycle: b -> a
	graph.nodes[a.id].parentId = b.id
	assert_bool(graph.is_descendant_of(a.id, b.id)).is_true()


func test_focus_ignores_unknown() -> void:
	var graph := Graph.new()
	graph.focus("ghost")
	assert_that(graph.focused_node_id).is_null()


func test_snapshot_restore_round_trip() -> void:
	var graph := Graph.new()
	var server := graph.add_node({"kind": "server", "title": "s"})
	graph.add_node({"kind": "project", "title": "p", "parentId": server.id})
	graph.toggle_collapsed(server.id)
	graph.set_camera({"x": 5.0, "zoom": 64.0})
	var snap := graph.snapshot()
	var json := JSON.stringify(snap)
	var parsed: Variant = JSON.parse_string(json)
	var other := Graph.new()
	other.restore(parsed)
	assert_int(other.nodes.size()).is_equal(2)
	assert_int(other.edges.size()).is_equal(1)
	assert_bool(other.collapsed_ids.has(server.id)).is_true()
	assert_that(other.focused_node_id).is_null()
	# camera is view state, not graph state — a fresh graph keeps its default
	assert_float(float(other.camera.zoom)).is_equal(Graph.ZOOM_DEFAULT)


func test_clear_resets_everything() -> void:
	var graph := Graph.new()
	var a := graph.add_node({"kind": "server", "title": "s"})
	graph.focus(a.id)
	graph.clear()
	assert_int(graph.nodes.size()).is_equal(0)
	assert_that(graph.focused_node_id).is_null()
	assert_float(float(graph.camera.zoom)).is_equal(Graph.ZOOM_DEFAULT)


func test_make_ids_unique() -> void:
	var graph := Graph.new()
	var ids: Dictionary = {}
	for i in range(100):
		ids[graph.make_id("srv")] = true
	assert_int(ids.size()).is_equal(100)
