class_name WorldRenderer
extends Node3D
## Renders graph entities as flat plates on the world plane, grouped by
## project on ground-platform markers with manhattan hub edges (INTENT.md
## world canon). Rebuilds incrementally on GraphStore changes. Flat/unshaded,
## token colors only, Nier calm.
##
## World mapping (INTENT.md axes): graph (x, y) → world XZ plane; world +Y is
## the ground normal. Labels stand on the zy plane (rotation 90° about Y so
## they face +X toward the camera), never billboards.

const PLATE_HEIGHT := 0.1
const EDGE_WIDTH := 0.06
const PLATFORM_MARGIN := 1.4
const PLATFORM_Y := 0.02
const EDGE_Y := 0.04
const LABEL_MIN_PX := 14.0
const LABEL_FONT_SIZE := 40
## Cards stand behind their node, raised above flight altitude so the ship
## never passes through text.
const CARD_HEIGHT := 1.5
const CARD_SETBACK := 0.6
const SERVER_RING_ALPHA := 0.22

## Footprints come from the layout table — plates and clearance agree.
const KIND_SIZE := GraphProjection.LAYOUT_SIZE

var _entities: Dictionary = {}
var _edges: Dictionary = {}
var _platforms: Dictionary = {}
var _server_ring: MeshInstance3D
var _server_radius := 0.0
var _cards_visible := true
var _outline_mat := StandardMaterial3D.new()
var _status_mats: Dictionary = {}
var _edge_mat := StandardMaterial3D.new()
var _platform_mat := StandardMaterial3D.new()
var _label_font: FontFile


## Hide every entity text card (chat readouts fade the world out).
func set_cards_visible(value: bool) -> void:
	_cards_visible = value
	for node_id in GraphStore.graph.nodes.keys():
		var entity: Variant = _entities.get(node_id)
		if entity is Dictionary:
			entity.card.visible = value and not _is_subagent(GraphStore.graph.nodes[node_id])


func server_ring_radius() -> float:
	return _server_radius


func is_inside_server(plane_pos: Vector2) -> bool:
	return _server_radius > 0.0 and plane_pos.length() <= _server_radius


func _ready() -> void:
	_outline_mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	_outline_mat.albedo_color = Tokens.INK
	for status in Graph.STATUSES:
		var mat := StandardMaterial3D.new()
		mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
		mat.albedo_color = status_color(status)
		_status_mats[status] = mat
	_edge_mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	_edge_mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	_edge_mat.albedo_color = Color(Tokens.INK_FAINT, 0.4)
	_platform_mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	_platform_mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	_platform_mat.albedo_color = Color(Tokens.INK_FAINT, 0.08)
	_label_font = load("res://assets/fonts/JetBrainsMono-Regular.ttf")
	GraphStore.graph.changed.connect(_on_graph_changed)
	_rebuild()


static func status_color(status: String) -> Color:
	match status:
		"running":
			return Tokens.INDIGO
		"attention":
			return Tokens.OCHRE
		"error":
			return Tokens.TERRACOTTA
		"done":
			return Tokens.MOSS
		"archived":
			return Tokens.PLUM
	return Tokens.INK_FAINT


func _on_graph_changed() -> void:
	_rebuild()


## Minimum rendered text height — 14 px relative to screen DPI (INTENT.md).
func _label_pixel_size() -> float:
	var viewport := get_viewport()
	var camera: Camera3D = viewport.get_camera_3d() if viewport != null else null
	if camera == null or not camera.orthogonal:
		return 0.004
	var screen_h := viewport.get_visible_rect().size.y
	if screen_h <= 0.0:
		return 0.004
	var world_per_px := (camera.size * 2.0) / screen_h
	return maxf(0.0035, (LABEL_MIN_PX * world_per_px) / LABEL_FONT_SIZE)


## Standing text card on the zy plane at the plate's camera-side edge.
func _make_card(text_value: String, color: Color) -> TextCard:
	var card := TextCard.create(
		text_value, _label_font, LABEL_FONT_SIZE, color, _label_pixel_size()
	)
	return card


func _rebuild() -> void:
	var graph := GraphStore.graph
	var seen: Dictionary = {}
	for node_id in graph.nodes.keys():
		var node: Dictionary = graph.nodes[node_id]
		if graph.is_hidden_by_collapse(node_id):
			continue
		seen[node_id] = true
		var entity: Variant = _entities.get(node_id)
		if entity is Dictionary:
			_update_entity(entity, node)
		else:
			_entities[node_id] = _create_entity(node)
	for entity_id in _entities.keys():
		if not seen.has(entity_id):
			var entity: Dictionary = _entities[entity_id]
			entity.root.queue_free()
			_entities.erase(entity_id)
	_rebuild_edges()
	_rebuild_platforms()


func _create_entity(node: Dictionary) -> Dictionary:
	var root := Node3D.new()
	root.name = String(node.id)
	add_child(root)
	var size: float = KIND_SIZE.get(String(node.kind), 1.2)
	var outline := _plate(size, PLATE_HEIGHT, _outline_mat, 0.0)
	root.add_child(outline)
	var fill := _plate(size - 0.14, 0.05, _mat_for_status(node.status), PLATE_HEIGHT + 0.005)
	root.add_child(fill)
	var card := _make_card(_label_text(node), Tokens.INK)
	card.position = Vector3(0, CARD_HEIGHT, -(size / 2.0 + CARD_SETBACK))
	root.add_child(card)
	var entity := {"root": root, "fill": fill, "card": card, "id": node.id}
	_update_entity(entity, node)
	return entity


func _update_entity(entity: Dictionary, node: Dictionary) -> void:
	var pos: Dictionary = node.position
	entity.root.position = Vector3(float(pos.x), 0.0, float(pos.y))
	entity.fill.material_override = _mat_for_status(node.status)
	entity.card.set_text(_label_text(node))
	# sub-agents are managed by their parent agent — no human-facing text
	entity.card.visible = not _is_subagent(node) and _cards_visible


## Defensive status-material lookup — an unmapped status renders as idle,
## never aborts entity construction (regression: daemon "closed" agents
## vanished because the lookup returned null into a typed parameter).
func _mat_for_status(status: String) -> StandardMaterial3D:
	var mat: Variant = _status_mats.get(status)
	return mat if mat is StandardMaterial3D else _status_mats["idle"]


func _is_subagent(node: Dictionary) -> bool:
	var meta: Dictionary = node.get("meta", {})
	return meta.get("subagent", false) == true


func _plate(size: float, height: float, mat: StandardMaterial3D, y_offset: float) -> MeshInstance3D:
	var mesh := BoxMesh.new()
	mesh.size = Vector3(size, height, size)
	mesh.material = mat
	var mi := MeshInstance3D.new()
	mi.mesh = mesh
	mi.position = Vector3(0, y_offset + height / 2.0, 0)
	return mi


func _label_text(node: Dictionary) -> String:
	var title: String = String(node.get("title", ""))
	if node.get("kind", "") == "agent" and String(node.get("status", "")) == "attention":
		return "▲ %s" % title
	return title


## Manhattan hub edges: parent → child as an L-bend on the ground plane.
func _rebuild_edges() -> void:
	var graph := GraphStore.graph
	var seen: Dictionary = {}
	for edge_id in graph.edges.keys():
		var edge: Dictionary = graph.edges[edge_id]
		var from_node: Variant = graph.nodes.get(edge.from)
		var to_node: Variant = graph.nodes.get(edge.to)
		if from_node == null or to_node == null:
			continue
		if graph.is_hidden_by_collapse(edge.to):
			continue
		seen[edge_id] = true
		var existing: Variant = _edges.get(edge_id)
		if existing is Node3D and is_instance_valid(existing):
			continue
		var holder := Node3D.new()
		holder.name = "edge_%s" % edge_id
		add_child(holder)
		var a: Dictionary = from_node.position
		var b: Dictionary = to_node.position
		holder.add_child(_segment(Vector2(a.x, a.y), Vector2(b.x, a.y)))
		holder.add_child(_segment(Vector2(b.x, a.y), Vector2(b.x, b.y)))
		_edges[edge_id] = holder
	for edge_id in _edges.keys():
		if not seen.has(edge_id):
			(_edges[edge_id] as Node3D).queue_free()
			_edges.erase(edge_id)


func _segment(from: Vector2, to: Vector2) -> MeshInstance3D:
	var length := (to - from).length()
	if length < 0.01:
		var skip := MeshInstance3D.new()
		skip.visible = false
		return skip
	var mesh := BoxMesh.new()
	mesh.size = Vector3(length, 0.02, EDGE_WIDTH)
	mesh.material = _edge_mat
	var mi := MeshInstance3D.new()
	mi.mesh = mesh
	var mid := (from + to) / 2.0
	mi.position = Vector3(mid.x, EDGE_Y, mid.y)
	if absf(to.x - from.x) < absf(to.y - from.y):
		mi.rotation_degrees = Vector3(0, 90, 0)
	return mi


## Per-project ground platforms: bounding rect of the project's subtree
## (the project node included — it must sit inside its own group area).
## No standing label; entering the area surfaces the name in the HUD and
## lights the platform border.
func _rebuild_platforms() -> void:
	var graph := GraphStore.graph
	var seen: Dictionary = {}
	for node_id in graph.nodes.keys():
		var node: Dictionary = graph.nodes[node_id]
		if node.kind != "project":
			continue
		var bounds: Variant = _subtree_bounds(node_id)
		if bounds == null:
			continue
		seen[node_id] = true
		var existing: Variant = _platforms.get(node_id)
		if existing is Dictionary and is_instance_valid(existing.root):
			_update_platform(existing, bounds)
			continue
		var root := Node3D.new()
		root.name = "platform_%s" % node_id
		add_child(root)
		var quad := MeshInstance3D.new()
		var mesh := PlaneMesh.new()
		mesh.material = _platform_mat
		quad.mesh = mesh
		quad.name = "fill"
		root.add_child(quad)
		var border := Node3D.new()
		border.name = "border"
		var border_mat := StandardMaterial3D.new()
		border_mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
		border_mat.albedo_color = Tokens.INK
		var thickness := 0.1
		var extent: Vector2 = bounds.size / 2.0 + Vector2.ONE * PLATFORM_MARGIN
		for spec in [
			{"pos": Vector3(0, 0, -extent.y), "size": Vector3(extent.x * 2.0, 0.03, thickness)},
			{"pos": Vector3(0, 0, extent.y), "size": Vector3(extent.x * 2.0, 0.03, thickness)},
			{"pos": Vector3(-extent.x, 0, 0), "size": Vector3(thickness, 0.03, extent.y * 2.0)},
			{"pos": Vector3(extent.x, 0, 0), "size": Vector3(thickness, 0.03, extent.y * 2.0)},
		]:
			var bar := BoxMesh.new()
			bar.size = spec.size
			bar.material = border_mat
			var bar_mi := MeshInstance3D.new()
			bar_mi.mesh = bar
			bar_mi.position = spec.pos
			border.add_child(bar_mi)
		border.visible = false
		root.add_child(border)
		var platform := {"root": root, "fill": quad, "border": border, "node_id": node_id}
		_update_platform(platform, bounds)
		_platforms[node_id] = platform
	for platform_id in _platforms.keys():
		if not seen.has(platform_id):
			(_platforms[platform_id].root as Node3D).queue_free()
			_platforms.erase(platform_id)
	_rebuild_server_ring()


func _update_platform(platform: Dictionary, bounds: Dictionary) -> void:
	var fill: MeshInstance3D = platform.fill
	(fill.mesh as PlaneMesh).size = Vector2(
		bounds.size.x + PLATFORM_MARGIN * 2.0, bounds.size.y + PLATFORM_MARGIN * 2.0
	)
	platform.root.position = Vector3(bounds.center.x, PLATFORM_Y, bounds.center.y)
	platform.border.position = Vector3(0, 0.02, 0)


## The platform containing a plane position, or null. Bounds include margin.
func platform_containing(plane_pos: Vector2) -> Variant:
	for platform_id in _platforms.keys():
		var platform: Dictionary = _platforms[platform_id]
		var bounds: Dictionary = _subtree_bounds(platform_id)
		if bounds == null:
			continue
		var min_v: Vector2 = bounds.min - Vector2.ONE * PLATFORM_MARGIN
		var max_v: Vector2 = bounds.max + Vector2.ONE * PLATFORM_MARGIN
		if (
			plane_pos.x >= min_v.x
			and plane_pos.x <= max_v.x
			and plane_pos.y >= min_v.y
			and plane_pos.y <= max_v.y
		):
			var node: Variant = GraphStore.graph.nodes.get(platform_id)
			return {
				"id": platform_id,
				"title": String(node.title) if node is Dictionary else "",
				"border": platform.border,
			}
	return null


func set_active_platform(id: String) -> void:
	for platform_id in _platforms.keys():
		(_platforms[platform_id].border as Node3D).visible = platform_id == id


## Giant circle encapsulating every node of the server's fleet.
func _rebuild_server_ring() -> void:
	var graph := GraphStore.graph
	var max_radius := 0.0
	for node_id in graph.nodes.keys():
		var node: Dictionary = graph.nodes[node_id]
		var pos: Dictionary = node.position
		var r: float = (
			Vector2(float(pos.x), float(pos.y)).length()
			+ float(KIND_SIZE.get(String(node.kind), 1.2)) / 2.0
		)
		max_radius = maxf(max_radius, r)
	if max_radius <= 0.0:
		return
	var radius := max_radius + 6.0
	_server_radius = radius
	if _server_ring != null and is_instance_valid(_server_ring):
		var mesh := _server_ring.mesh as TorusMesh
		mesh.inner_radius = radius - 0.15
		mesh.outer_radius = radius
		return
	var mesh := TorusMesh.new()
	mesh.inner_radius = radius - 0.15
	mesh.outer_radius = radius
	var mat := StandardMaterial3D.new()
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	mat.albedo_color = Color(Tokens.INK_FAINT, SERVER_RING_ALPHA)
	mesh.material = mat
	_server_ring = MeshInstance3D.new()
	_server_ring.mesh = mesh
	_server_ring.position.y = 0.03
	add_child(_server_ring)


func _subtree_bounds(node_id: String) -> Variant:
	var graph := GraphStore.graph
	var min_v := Vector2(INF, INF)
	var max_v := Vector2(-INF, -INF)
	var found := false
	var stack: Array = [node_id]
	while not stack.is_empty():
		var current: String = stack.pop_back()
		for child_id in graph.nodes.keys():
			var child: Dictionary = graph.nodes[child_id]
			if child.parentId == current:
				stack.append(child_id)
		var node: Variant = graph.nodes.get(current)
		if node == null:
			continue
		var pos: Dictionary = node.position
		var v := Vector2(float(pos.x), float(pos.y))
		min_v = min_v.min(v)
		max_v = max_v.max(v)
		found = true
	if not found:
		return null
	return {"min": min_v, "max": max_v, "size": max_v - min_v, "center": (min_v + max_v) / 2.0}


func entity_world_pos(node_id: String) -> Variant:
	var entity: Variant = _entities.get(node_id)
	if entity is Dictionary:
		return entity.root.position
	return null


func node_plate_size(node_id: String) -> float:
	var node: Variant = GraphStore.graph.nodes.get(node_id)
	if node is Dictionary:
		return KIND_SIZE.get(String(node.kind), 1.2)
	return 1.2
