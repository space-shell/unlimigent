class_name Graph
extends RefCounted
## Engine-agnostic graph state — 1:1 port of the web core (src/graph/store.ts,
## src/graph/types.ts, src/graph/factory.ts). State lives in plain
## Dictionaries so snapshots round-trip through JSON format version 1
## unchanged (the web app's exports import cleanly).

signal changed

const SNAPSHOT_VERSION := 1

const ZOOM_MIN := 4.0
const ZOOM_MAX := 256.0
const ZOOM_DEFAULT := 48.0
const THETA_ISO := PI / 4.0
## Classic isometric elevation: ground axes project at ±30° on screen.
const PHI_ISO := 0.6154797086703874  # atan(1/sqrt(2))

const KINDS: PackedStringArray = [
	"server",
	"project",
	"workspace",
	"worktree",
	"agent",
	"schedule",
	"integration",
]
const STATUSES: PackedStringArray = [
	"idle",
	"running",
	"attention",
	"error",
	"done",
	"archived",
]
const INFO_KINDS: PackedStringArray = ["server", "project", "workspace", "worktree"]

var nodes: Dictionary = {}
var edges: Dictionary = {}
var focused_node_id: Variant = null
var collapsed_ids: Dictionary = {}
var camera: Dictionary = _default_camera()

var _id_counter := 0
var _rng := RandomNumberGenerator.new()
var _change_pending := false


## Coalesce change notifications: a projection pass performing dozens of
## mutations emits `changed` once, on the next frame — not once per mutation
## (the per-mutation rebuild storm caused the ~3.5 s device stutter).
func _notify() -> void:
	if _change_pending:
		return
	_change_pending = true
	_emit_changed.call_deferred()


func _emit_changed() -> void:
	_change_pending = false
	changed.emit()


func _init() -> void:
	_rng.randomize()


func _default_camera() -> Dictionary:
	return {
		"x": 0.0,
		"y": 0.0,
		"zoom": ZOOM_DEFAULT,
		"theta": THETA_ISO,
		"phi": PHI_ISO,
	}


func make_id(prefix: String) -> String:
	_id_counter += 1
	var epoch_ms := int(Time.get_unix_time_from_system() * 1000.0)
	return (
		"%s_%s%s%s"
		% [
			prefix,
			_base36(epoch_ms),
			_base36(_id_counter),
			_base36(_rng.randi_range(0, 2176782336)),
		]
	)


func _base36(value: int) -> String:
	if value <= 0:
		return "0"
	var digits := "0123456789abcdefghijklmnopqrstuvwxyz"
	var out := ""
	while value > 0:
		out = digits[value % 36] + out
		value /= 36
	return out


## createNode port. init keys: kind, title, position?, parentId?, origin?,
## externalId?, status?, meta? — defaults match the web factory exactly.
func create_node(init: Dictionary) -> Dictionary:
	var node := {
		"id": make_id(String(init.kind).substr(0, 3)),
		"kind": init.kind,
		"title": init.get("title", ""),
		"position": init.get("position", {"x": 0.0, "y": 0.0}),
		"status": init.get("status", "idle"),
		"parentId": init.get("parentId", null),
		"origin": init.get("origin", "user"),
		"externalId": init.get("externalId", null),
		"meta": init.get("meta", {}),
		"createdAt": int(Time.get_unix_time_from_system() * 1000.0),
	}
	nodes[node.id] = node
	_notify()
	return node


func create_edge(from: String, to: String, kind: String) -> Dictionary:
	var edge := {"id": make_id("edg"), "from": from, "to": to, "kind": kind}
	edges[edge.id] = edge
	_notify()
	return edge


func add_node(init: Dictionary) -> Dictionary:
	var node := create_node(init)
	var parent_id: Variant = init.get("parentId", null)
	if parent_id is String and nodes.has(parent_id):
		create_edge(parent_id, node.id, "contains")
	return node


func move_node(id: String, position: Dictionary) -> void:
	var node: Variant = nodes.get(id)
	if node == null:
		return
	node.position = {"x": position.get("x", 0.0), "y": position.get("y", 0.0)}
	_notify()


func set_node_status(id: String, status: String) -> void:
	var node: Variant = nodes.get(id)
	if node == null:
		return
	node.status = status
	_notify()


func set_node_title(id: String, title: String) -> void:
	var node: Variant = nodes.get(id)
	if node == null:
		return
	node.title = title
	_notify()


func set_node_meta(id: String, meta: Dictionary) -> void:
	var node: Variant = nodes.get(id)
	if node == null:
		return
	node.meta = meta
	_notify()


func remove_node(id: String) -> void:
	if not nodes.has(id):
		return
	for edge_id in edges.keys():
		var edge: Dictionary = edges[edge_id]
		if edge.from == id or edge.to == id:
			edges.erase(edge_id)
	for node_id in nodes.keys():
		var node: Dictionary = nodes[node_id]
		if node.parentId == id:
			node.parentId = null
	nodes.erase(id)
	if focused_node_id == id:
		focused_node_id = null
	_notify()


func connect_nodes(from: String, to: String, kind: String) -> Variant:
	if not nodes.has(from) or not nodes.has(to) or from == to:
		return null
	for edge_id in edges.keys():
		var edge: Dictionary = edges[edge_id]
		if edge.from == from and edge.to == to and edge.kind == kind:
			return edge
	return create_edge(from, to, kind)


## Move a node to a new parent, replacing its contains edge.
## Returns true when the parent actually changed.
func reparent(id: String, parent_id: Variant) -> bool:
	var node: Variant = nodes.get(id)
	if node == null or node.parentId == parent_id:
		return false
	if parent_id != null and not nodes.has(parent_id):
		return false
	var before: Variant = node.parentId
	for edge_id in edges.keys():
		var edge: Dictionary = edges[edge_id]
		if edge.kind == "contains" and edge.to == id:
			edges.erase(edge_id)
	if parent_id != null:
		create_edge(parent_id, id, "contains")
	node.parentId = parent_id
	_notify()
	return nodes.get(id, {}).get("parentId", before) != before


func toggle_collapsed(id: String) -> void:
	if not nodes.has(id):
		return
	if collapsed_ids.has(id):
		collapsed_ids.erase(id)
	else:
		collapsed_ids[id] = true
	_notify()


func is_descendant_of(id: String, ancestor_id: String) -> bool:
	var current: Variant = nodes.get(id, {}).get("parentId", null)
	var seen: Dictionary = {}
	while current is String and not seen.has(current):
		if current == ancestor_id:
			return true
		seen[current] = true
		current = nodes.get(current, {}).get("parentId", null)
	return false


## True when the node is inside any collapsed subtree (thus hidden).
func is_hidden_by_collapse(id: String) -> bool:
	for collapsed_id in collapsed_ids.keys():
		if collapsed_id != id and is_descendant_of(id, collapsed_id):
			return true
	return false


func focus(id: Variant) -> void:
	if id != null and id is String and not nodes.has(id):
		return
	focused_node_id = id
	_notify()


func set_camera(partial: Dictionary) -> void:
	for key in ["x", "y", "zoom", "theta", "phi"]:
		if partial.has(key):
			camera[key] = partial[key]
	_notify()


func child_count(parent_id: String) -> int:
	var n := 0
	for node_id in nodes.keys():
		if nodes[node_id].parentId == parent_id:
			n += 1
	return n


func snapshot() -> Dictionary:
	var collapsed: Array = []
	for id in collapsed_ids.keys():
		collapsed.append(id)
	return {
		"version": SNAPSHOT_VERSION,
		"nodes": nodes.duplicate(true),
		"edges": edges.duplicate(true),
		"collapsedIds": collapsed,
	}


func restore(snap: Dictionary) -> void:
	nodes = snap.get("nodes", {}).duplicate(true)
	edges = snap.get("edges", {}).duplicate(true)
	collapsed_ids = {}
	for id in snap.get("collapsedIds", []):
		collapsed_ids[id] = true
	focused_node_id = null
	_notify()


func clear() -> void:
	nodes = {}
	edges = {}
	collapsed_ids = {}
	focused_node_id = null
	camera = _default_camera()
	_notify()
