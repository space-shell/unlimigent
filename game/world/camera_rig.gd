class_name CameraRig
extends Node
## Iso follow camera: keeps the classic isometric angle, tracks the ship
## (or an activated entity, briefly), smoothed. The Camera3D stays a dumb
## consumer — this rig computes target offsets only.

const FOLLOW_LERP := 4.0
const SHIP_OFFSET := Vector3(10, 10, 10)
const FOCUS_OFFSET := Vector3(6, 6, 6)
const FOCUS_RETURN_SEC := 4.0

var camera: Camera3D
var ship: Ship
var _focus_target: Variant = null
var _focus_until := 0.0


func setup(p_camera: Camera3D, p_ship: Ship) -> void:
	camera = p_camera
	ship = p_ship
	IntentBus.on("node.activate", _on_node_activate)


func _on_node_activate(intent: Dictionary) -> void:
	var id: Variant = intent.get("id")
	if id is String and GraphStore.graph.nodes.has(id):
		_focus_target = id
		_focus_until = Time.get_ticks_msec() / 1000.0 + FOCUS_RETURN_SEC


func _physics_process(delta: float) -> void:
	if camera == null or ship == null:
		return
	var target := ship.position + SHIP_OFFSET
	if _focus_target is String and Time.get_ticks_msec() / 1000.0 < _focus_until:
		var node: Variant = GraphStore.graph.nodes.get(_focus_target)
		if node is Dictionary:
			var pos: Dictionary = node.position
			target = Vector3(float(pos.x), 0.0, float(pos.y)) + FOCUS_OFFSET
		else:
			_focus_target = null
	camera.position = camera.position.lerp(target, FOLLOW_LERP * delta)
	camera.look_at(Vector3(ship.position.x, 0, ship.position.z), Vector3.UP)
