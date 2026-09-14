class_name Interaction
extends Node3D
## Approach-to-interact: a flat square outline (no curves — INTENT.md visual
## identity) marks the nearest entity, sized to its plate; holding dock for
## 600 ms tightens and warms the outline, then locks with an expanding square
## flash and activates the entity — node.activate intent → focus pull +
## inspect readout on a standing text card.

const DOCK_RADIUS := 3.2
const DOCK_HOLD_SEC := 0.6
const INSPECT_SEC := 5.0
const RING_Y := 0.16
const OUTLINE_MARGIN := 0.35
const OUTLINE_THICKNESS := 0.08

var _ring: Node3D
var _ring_mat := StandardMaterial3D.new()
var _flash: Node3D
var _flash_mat := StandardMaterial3D.new()
var _nearest_id: String = ""
var _hold_time := 0.0
var _docking := false
var _inspect: TextCard
var _inspect_until := 0.0
var _label_font: FontFile

@onready var world: WorldRenderer
@onready var ship: Ship


func _ready() -> void:
	world = get_node("../World")
	ship = get_node("../Ship")
	_ring_mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	_ring_mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	_ring_mat.albedo_color = Color(Tokens.INDIGO, 0.9)
	_ring = _square_outline(1.0, _ring_mat)
	_ring.position.y = RING_Y
	_ring.visible = false
	add_child(_ring)

	_flash_mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	_flash_mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	_flash_mat.albedo_color = Color(Tokens.MOSS, 0.0)
	_flash = _square_outline(1.0, _flash_mat)
	_flash.position.y = RING_Y
	_flash.visible = false
	add_child(_flash)

	_label_font = load("res://assets/fonts/JetBrainsMono-Regular.ttf")
	_inspect = TextCard.create("", _label_font, 44, Tokens.INK, 0.004)
	_inspect.visible = false
	add_child(_inspect)

	IntentBus.on("ship.dock", func(_i: Dictionary) -> void: _docking = true)
	IntentBus.on(
		"ship.undock",
		func(_i: Dictionary) -> void:
			_docking = false
			_hold_time = 0.0
	)


## Four thin bars forming a flat square outline around the origin.
func _square_outline(half: float, mat: StandardMaterial3D) -> Node3D:
	var root := Node3D.new()
	var length := half * 2.0
	for spec in [
		{
			"pos": Vector3(0, 0, -half),
			"size": Vector3(length + OUTLINE_THICKNESS, 0.03, OUTLINE_THICKNESS)
		},
		{
			"pos": Vector3(0, 0, half),
			"size": Vector3(length + OUTLINE_THICKNESS, 0.03, OUTLINE_THICKNESS)
		},
		{"pos": Vector3(-half, 0, 0), "size": Vector3(OUTLINE_THICKNESS, 0.03, length)},
		{"pos": Vector3(half, 0, 0), "size": Vector3(OUTLINE_THICKNESS, 0.03, length)},
	]:
		var mesh := BoxMesh.new()
		mesh.size = spec.size
		mesh.material = mat
		var mi := MeshInstance3D.new()
		mi.mesh = mesh
		mi.position = spec.pos
		root.add_child(mi)
	return root


func _physics_process(delta: float) -> void:
	_update_nearest()
	if Time.get_ticks_msec() / 1000.0 > _inspect_until:
		_inspect.visible = false
	if _nearest_id == "":
		_ring.visible = false
		_hold_time = 0.0
		return
	_ring.visible = true
	if _docking:
		_hold_time += delta
		var progress: float = clampf(_hold_time / DOCK_HOLD_SEC, 0.0, 1.0)
		_ring.scale = Vector3.ONE * (1.0 - 0.25 * progress)
		_ring.rotation_degrees.y = 90.0 * progress
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
		var half := world.node_plate_size(best_id) / 2.0 + OUTLINE_MARGIN
		_ring.position = Vector3(pos.x, RING_Y, pos.z)
		_flash.position = Vector3(pos.x, RING_Y, pos.z)
		_ring.scale = Vector3.ONE * half
		_ring.rotation_degrees.y = 0.0


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
	_inspect.set_text("\n".join(lines))
	_inspect.set_pixel_size(maxf(0.004, _label_min_units() / 44.0))
	_inspect.visible = true
	_inspect.position = Vector3(ship.position.x, 0.9, ship.position.z - 1.2)
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
	_flash.scale = _ring.scale * 0.9
	_flash.rotation_degrees.y = 0.0
	_flash_mat.albedo_color = Color(Tokens.MOSS, 0.9)
	var tween := create_tween()
	tween.tween_property(_flash, "scale", _ring.scale * 2.2, 0.35)
	tween.parallel().tween_property(_flash_mat, "albedo_color:a", 0.0, 0.35)
	tween.tween_callback(func() -> void: _flash.visible = false)
