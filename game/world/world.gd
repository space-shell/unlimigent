class_name WorldRenderer
extends Node3D
## Renders graph entities as flat plates on the world plane. Rebuilds
## incrementally on GraphStore changes — entities keyed by node id, positions
## and status updated in place. Flat/unshaded, token colors only, Nier calm.

const PLATE_HEIGHT := 0.1
const LABEL_OFFSET := 0.9

const KIND_SIZE := {
	"server": 2.2,
	"project": 1.8,
	"workspace": 1.6,
	"worktree": 1.6,
	"agent": 1.2,
	"schedule": 1.2,
	"integration": 1.2,
}

var _entities: Dictionary = {}
var _outline_mat := StandardMaterial3D.new()
var _status_mats: Dictionary = {}
var _label_font: FontFile


func _ready() -> void:
	_outline_mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	_outline_mat.albedo_color = Tokens.INK
	for status in Graph.STATUSES:
		var mat := StandardMaterial3D.new()
		mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
		mat.albedo_color = status_color(status)
		_status_mats[status] = mat
	_label_font = load("res://assets/fonts/JetBrainsMono-Regular.ttf")
	GraphStore.graph.changed.connect(_on_graph_changed)
	_rebuild()


func status_color(status: String) -> Color:
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


func _create_entity(node: Dictionary) -> Dictionary:
	var root := Node3D.new()
	root.name = String(node.id)
	add_child(root)
	var size: float = KIND_SIZE.get(String(node.kind), 1.2)
	var outline := _plate(size, PLATE_HEIGHT, _outline_mat)
	root.add_child(outline)
	var fill := _plate(size - 0.12, PLATE_HEIGHT + 0.02, _status_mats[node.status])
	root.add_child(fill)
	var label := Label3D.new()
	label.text = _label_text(node)
	label.font = _label_font
	label.font_size = 48
	label.modulate = Tokens.INK
	label.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	label.no_depth_test = true
	label.pixel_size = 0.004
	label.position = Vector3(0, LABEL_OFFSET, 0)
	label.outline_size = 0
	root.add_child(label)
	var entity := {"root": root, "fill": fill, "label": label, "id": node.id}
	_update_entity(entity, node)
	return entity


func _update_entity(entity: Dictionary, node: Dictionary) -> void:
	var pos: Dictionary = node.position
	entity.root.position = Vector3(float(pos.x), 0.0, float(pos.y))
	entity.fill.material_override = _status_mats[node.status]
	entity.label.text = _label_text(node)


func _plate(size: float, height: float, mat: StandardMaterial3D) -> MeshInstance3D:
	var mesh := BoxMesh.new()
	mesh.size = Vector3(size, height, size)
	var mi := MeshInstance3D.new()
	mesh.material = mat
	mi.mesh = mesh
	mi.position = Vector3(0, height / 2.0, 0)
	return mi


func _label_text(node: Dictionary) -> String:
	var title: String = String(node.get("title", ""))
	if node.get("kind", "") == "agent" and node.meta != null:
		var status: String = String(node.get("status", ""))
		if status == "attention":
			return "▲ %s" % title
	return title


func entity_world_pos(node_id: String) -> Variant:
	var entity: Variant = _entities.get(node_id)
	if entity is Dictionary:
		return entity.root.position
	return null
