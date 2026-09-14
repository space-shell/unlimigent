# Camera rig unit tests — ship-relative zoom clamps and reset.
extends GdUnitTestSuite


func _make_rig() -> Array:
	var parent := Node3D.new()
	auto_free(parent)
	add_child(parent)
	var camera := Camera3D.new()
	camera.projection = Camera3D.PROJECTION_ORTHOGONAL
	parent.add_child(camera)
	var ship := Ship.new()
	parent.add_child(ship)
	var rig := CameraRig.new()
	parent.add_child(rig)
	rig.setup(camera, ship)
	return [rig, camera]


func test_zoom_clamps_low() -> void:
	assert_float(CameraRig.clamp_size(0.1)).is_equal(CameraRig.SIZE_MIN)


func test_zoom_clamps_high() -> void:
	assert_float(CameraRig.clamp_size(500.0)).is_equal(CameraRig.SIZE_MAX)


func test_clamps_derive_from_ship_screen_fractions() -> void:
	# hull 0.75 units; ortho size is full vertical extent:
	# 50% occupation -> 1.5, 2% -> 37.5
	assert_float(CameraRig.SIZE_MIN).is_equal(1.5)
	assert_float(CameraRig.SIZE_MAX).is_equal(37.5)


func test_zoom_intent_moves_size() -> void:
	var fixtures := _make_rig()
	var rig: CameraRig = fixtures[0]
	var camera: Camera3D = fixtures[1]
	var before := camera.size
	IntentBus.dispatch({"type": "camera.zoom", "source": "gamepad", "delta": 1.0})
	for i in range(30):
		await get_tree().physics_frame
	assert_float(camera.size).is_greater(before)
	IntentBus.dispatch({"type": "camera.zoom", "source": "gamepad", "delta": -1.0})
	for i in range(30):
		await get_tree().physics_frame
	assert_float(camera.size).is_less(before)
	rig._reset_zoom.call_deferred()
	await get_tree().create_timer(CameraRig.RESET_TWEEN_SEC + 0.1).timeout
	assert_float(camera.size).is_equal_approx(CameraRig.SIZE_DEFAULT, 0.01)
	rig.queue_free()


func test_docking_zooms_in_to_reading_level() -> void:
	var fixtures := _make_rig()
	var rig: CameraRig = fixtures[0]
	var camera: Camera3D = fixtures[1]
	GraphStore.graph.add_node({"kind": "agent", "title": "probe", "id": ""})
	var node_id: String = GraphStore.graph.nodes.keys()[0]
	IntentBus.dispatch({"type": "node.activate", "source": "system", "id": node_id})
	await get_tree().create_timer(CameraRig.FOCUS_TWEEN_SEC + 0.15).timeout
	assert_float(camera.size).is_equal_approx(CameraRig.FOCUS_SIZE, 0.2)
	GraphStore.graph.clear()
	rig.queue_free()


func test_compass_active_statuses() -> void:
	assert_bool(Compass.is_active_status("running")).is_true()
	assert_bool(Compass.is_active_status("attention")).is_true()
	assert_bool(Compass.is_active_status("error")).is_true()
	assert_bool(Compass.is_active_status("idle")).is_false()
	assert_bool(Compass.is_active_status("done")).is_false()
	assert_bool(Compass.is_active_status("archived")).is_false()
