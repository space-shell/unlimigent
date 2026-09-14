class_name Compass
extends Control
## Compass ring: a translucent circle (diameter = 50% of the min screen
## dimension) centred on the ship's screen position. Active nodes outside
## the ring highlight an arc segment on the circle in the node's direction,
## colored by node state — off-screen awareness without leaving the ship.

const RING_WIDTH := 4.0
const RING_ALPHA := 0.4
const HIGHLIGHT_WIDTH := 14.0
const HIGHLIGHT_SPAN_DEG := 12.0
const HIGHLIGHT_ALPHA := 0.9
## Compass scales with zoom (pilot spec): 90% of the min screen dimension
## at max zoom, 40% at min zoom, interpolated in log-zoom space.
const FRACTION_MAX_ZOOM := 0.9
const FRACTION_MIN_ZOOM := 0.4
## Smooth follow: the ring trails the ship with a slight delay.
const FOLLOW_LERP := 6.0

## Statuses that warrant directional attention.
const ACTIVE_STATUSES: PackedStringArray = ["running", "attention", "error"]

var ship: Ship
var camera: Camera3D
var world: WorldRenderer
var _center := Vector2.ZERO
var _center_initialized := false
var _visibility := 1.0


func setup(p_ship: Ship, p_camera: Camera3D, p_world: WorldRenderer = null) -> void:
	ship = p_ship
	camera = p_camera
	world = p_world


## Diameter as a fraction of the min screen dimension at an ortho size.
static func diameter_fraction(camera_size: float) -> float:
	var lo := log(CameraRig.SIZE_MAX)
	var hi := log(CameraRig.SIZE_MIN)
	var t := clampf((lo - log(camera_size)) / (lo - hi), 0.0, 1.0)
	return lerpf(FRACTION_MIN_ZOOM, FRACTION_MAX_ZOOM, t)


func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	_resize_to_viewport()
	var viewport := get_viewport()
	if viewport != null:
		viewport.size_changed.connect(_resize_to_viewport)


func _resize_to_viewport() -> void:
	var viewport := get_viewport()
	if viewport == null:
		return
	size = viewport.get_visible_rect().size
	position = Vector2.ZERO


func _process(delta: float) -> void:
	if ship != null and camera != null and camera.is_inside_tree():
		var target := camera.unproject_position(ship.position)
		if not _center_initialized:
			_center = target
			_center_initialized = true
		else:
			_center = _center.lerp(target, 1.0 - exp(-FOLLOW_LERP * delta))
	# the compass lives inside the server ring: fade out when the ship
	# leaves the fleet boundary, fade in on entering
	var target_visibility := 1.0
	if world != null and ship != null:
		target_visibility = 1.0 if world.is_inside_server(ship.plane_position()) else 0.0
	_visibility += (target_visibility - _visibility) * minf(delta * 4.0, 1.0)
	queue_redraw()


static func is_active_status(status: String) -> bool:
	return status in ACTIVE_STATUSES


## Sub-agents are managed by their parent agent — no human interaction
## needed, so they never draw compass highlights.
static func should_show(node: Dictionary) -> bool:
	if not is_active_status(String(node.get("status", ""))):
		return false
	var meta: Dictionary = node.get("meta", {})
	return meta.get("subagent", false) != true


func _draw() -> void:
	if ship == null or camera == null or not camera.is_inside_tree():
		return
	var radius := minf(size.x, size.y) * 0.5 * diameter_fraction(camera.size)
	if radius < 4.0:
		return
	var center := _center
	# translucent band: fill + crisp edges
	draw_circle(center, radius, Color(Tokens.INK_FAINT, 0.05))
	draw_arc(center, radius, 0.0, TAU, 128, Color(Tokens.INK_FAINT, RING_ALPHA), RING_WIDTH)
	var span := deg_to_rad(HIGHLIGHT_SPAN_DEG)
	for node_id in GraphStore.graph.nodes.keys():
		var node: Dictionary = GraphStore.graph.nodes[node_id]
		if not should_show(node):
			continue
		var pos: Dictionary = node.position
		var screen_pos := camera.unproject_position(Vector3(float(pos.x), 0.0, float(pos.y)))
		if screen_pos.distance_to(center) <= radius:
			continue
		var angle := (screen_pos - center).angle()
		var color := WorldRenderer.status_color(String(node.get("status", "")))
		draw_arc(
			center,
			radius,
			angle - span / 2.0,
			angle + span / 2.0,
			16,
			Color(color, HIGHLIGHT_ALPHA),
			HIGHLIGHT_WIDTH,
		)
