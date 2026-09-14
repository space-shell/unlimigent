class_name Interaction
extends Node3D
## Approach-to-interact: a flat proximity ring marks the nearest entity;
## holding dock (touch hold on the right side / gamepad A) for 600 ms
## tightens and warms the ring, then locks with an expanding flash and
## activates the entity — node.activate intent → focus pull + inspect
## readout standing in the world. Replaces web-era tap-select with flight.

const DOCK_RADIUS := 3.0
const DOCK_HOLD_SEC := 0.6
const INSPECT_SEC := 5.0
const RING_Y := 0.16

var _ring: MeshInstance3D
var _ring_mat := StandardMaterial3D.new()
var _flash: MeshInstance3D
var _flash_mat := StandardMaterial3D.new()
var _nearest_id: String = ""
var _hold_time := 0.0
var _docking := false
var _inspect_panel: Label3D
var _inspect_until := 0.0
var _label_font: FontFile

@onready var world: WorldRenderer
@onready var ship: Ship


func _ready() -> void:
	world = get_node("../World")
	ship = get_node("../Ship")
	var mesh := TorusMesh.new()
	mesh.inner_radius = 0.95
	mesh.outer_radius = 1.05
	_ring_mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	_ring_mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	_ring_mat.albedo_color = Color(Tokens.INDIGO, 0.9)
	mesh.material = _ring_mat
	_ring = MeshInstance3D.new()
	_ring.mesh = mesh
	_ring.position.y = RING_Y
	_ring.visible = false
	add_child(_ring)

	var flash_mesh := TorusMesh.new()
	flash_mesh.inner_radius = 0.95
	flash_mesh.outer_radius = 1.05
	_flash_mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	_flash_mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	_flash_mat.albedo_color = Color(Tokens.MOSS, 0.0)
	flash_mesh.material = _flash_mat
	_flash = MeshInstance3D.new()
	_flash.mesh = flash_mesh
	_flash.position.y = RING_Y
	_flash.visible = false
	add_child(_flash)

	_label_font = load("res://assets/fonts/JetBrainsMono-Regular.ttf")
	_inspect_panel = Label3D.new()
	_inspect_panel.font = _label_font
	_inspect_panel.font_size = 44
	_inspect_panel.modulate = Tokens.INK
	_inspect_panel.no_depth_test = true
	_inspect_panel.pixel_size = 0.004
	_inspect_panel.outline_size = 0
	_inspect_panel.rotation_degrees = Vector3(0, 90, 0)
	_inspect_panel.visible = false
	add_child(_inspect_panel)

	IntentBus.on("ship.dock", func(_i: Dictionary) -> void: _docking = true)
	IntentBus.on(
		"ship.undock",
		func(_i: Dictionary) -> void:
			_docking = false
			_hold_time = 0.0
	)


func _physics_process(delta: float) -> void:
	_update_nearest()
	if Time.get_ticks_msec() / 1000.0 > _inspect_until:
		_inspect_panel.visible = false
	if _nearest_id == "":
		_ring.visible = false
		_hold_time = 0.0
		return
	_ring.visible = true
	if _docking:
		_hold_time += delta
		var progress: float = clampf(_hold_time / DOCK_HOLD_SEC, 0.0, 1.0)
		_ring.scale = Vector3.ONE * (1.0 - 0.3 * progress)
		_ring.rotation_degrees.y = 720.0 * progress
		_ring_mat.albedo_color = Tokens.INDIGO.lerp(Tokens.OCHRE, progress)
		if _hold_time >= DOCK_HOLD_SEC:
			_hold_time = 0.0
			_docking = false
			_activate(_nearest_id)
	else:
		_hold_time = 0.0
		_ring.scale = Vector3.ONE
		_ring.rotation_degrees.y = 0.0
		_ring_mat.albedo_color = Color(Tokens.INDIGO, 0.9)


func _update_nearest() -> void:
	var ship_pos := ship.plane_position()
	var best_id := ""
	var best_dist := DOCK_RADIUS
	for node_id in GraphStore.graph.nodes.keys():
		var entity_pos: Variant = world.entity_world_pos(node_id)
		if entity_pos is Vector3:
			var dist := Vector2(entity_pos.x, entity_pos.z).distance_to(ship_pos)
			if dist < best_dist:
				best_dist = dist
				best_id = node_id
	_nearest_id = best_id
	if best_id != "":
		var pos: Vector3 = world.entity_world_pos(best_id)
		_ring.position = Vector3(pos.x, RING_Y, pos.z)
		_flash.position = Vector3(pos.x, RING_Y, pos.z)


func _activate(node_id: String) -> void:
	IntentBus.dispatch({"type": "node.activate", "source": "system", "id": node_id})
	_play_lock_flash()
	var node: Variant = GraphStore.graph.nodes.get(node_id)
	if node is not Dictionary:
		return
	GraphStore.graph.focus(node_id)
	var lines: Array[String] = [String(node.title)]
	var meta: Dictionary = node.get("meta", {})
	for key in ["provider", "model", "branch", "pr", "git"]:
		var value: Variant = meta.get(key)
		if value != null and String(value) != "":
			lines.append("%s %s" % [key, value])
	lines.append("· %s" % String(node.get("status", "")))
	_inspect_panel.text = "\n".join(lines)
	_inspect_panel.visible = true
	_inspect_panel.position = Vector3(ship.position.x, 0.9, ship.position.z - 1.0)
	_inspect_panel.pixel_size = maxf(0.004, (_label_min_units()) / 44.0)
	_inspect_until = Time.get_ticks_msec() / 1000.0 + INSPECT_SEC


func _label_min_units() -> float:
	var viewport := get_viewport()
	var camera: Camera3D = viewport.get_camera_3d() if viewport != null else null
	if camera == null or not camera.orthogonal:
		return 0.176
	var screen_h := viewport.get_visible_rect().size.y
	if screen_h <= 0.0:
		return 0.176
	return 14.0 * (camera.size * 2.0) / screen_h


func _play_lock_flash() -> void:
	_flash.visible = true
	_flash.scale = Vector3.ONE * 0.8
	_flash_mat.albedo_color = Color(Tokens.MOSS, 0.9)
	var tween := create_tween()
	tween.tween_property(_flash, "scale", Vector3.ONE * 2.0, 0.35)
	tween.parallel().tween_property(_flash_mat, "albedo_color:a", 0.0, 0.35)
	tween.tween_callback(func() -> void: _flash.visible = false)
