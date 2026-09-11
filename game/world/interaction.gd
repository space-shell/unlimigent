class_name Interaction
extends Node3D
## Approach-to-interact: a proximity ring marks the nearest entity; holding
## dock (touch hold on the right side / gamepad A) for 600 ms activates it —
## node.activate intent → focus tween + inspect readout. Replaces web-era
## tap-select with flight.

const DOCK_RADIUS := 2.6
const DOCK_HOLD_SEC := 0.6
const INSPECT_SEC := 5.0

var _ring: MeshInstance3D
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
	mesh.inner_radius = 0.9
	mesh.outer_radius = 1.0
	var mat := StandardMaterial3D.new()
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	mat.albedo_color = Color(Tokens.INDIGO, 0.9)
	mesh.material = mat
	_ring = MeshInstance3D.new()
	_ring.mesh = mesh
	_ring.rotation_degrees = Vector3(90, 0, 0)
	_ring.visible = false
	add_child(_ring)

	_label_font = load("res://assets/fonts/JetBrainsMono-Regular.ttf")
	_inspect_panel = Label3D.new()
	_inspect_panel.font = _label_font
	_inspect_panel.font_size = 44
	_inspect_panel.modulate = Tokens.INK
	_inspect_panel.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	_inspect_panel.no_depth_test = true
	_inspect_panel.pixel_size = 0.0035
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
		var progress := _hold_time / DOCK_HOLD_SEC
		_ring.scale = Vector3.ONE * (1.0 + 0.12 * progress)
		_ring.rotation_degrees.z = 360.0 * progress
		if _hold_time >= DOCK_HOLD_SEC:
			_hold_time = 0.0
			_docking = false
			_activate(_nearest_id)
	else:
		_hold_time = 0.0
		_ring.scale = Vector3.ONE
		_ring.rotation_degrees.z = 0.0


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
		_ring.position = Vector3(pos.x, 0.12, pos.z)


func _activate(node_id: String) -> void:
	IntentBus.dispatch({"type": "node.activate", "source": "system", "id": node_id})
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
	_inspect_panel.position = Vector3(ship.position.x, 1.8, ship.position.z - 1.0)
	_inspect_until = Time.get_ticks_msec() / 1000.0 + INSPECT_SEC
