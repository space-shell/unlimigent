extends Node
## GraphStore autoload: owns the Graph, persists snapshots under user://
## (debounced autosave on change) and provides JSON export/import in the
## web-compatible version 1 format.

const STORAGE_PATH := "user://graph.json"
const SAVE_DEBOUNCE_SEC := 0.5

var graph := Graph.new()
var _save_timer: Timer


func _ready() -> void:
	_save_timer = Timer.new()
	_save_timer.one_shot = true
	_save_timer.wait_time = SAVE_DEBOUNCE_SEC
	_save_timer.timeout.connect(_save_now)
	add_child(_save_timer)
	graph.changed.connect(_schedule_save)
	_load()


func reset() -> void:
	graph.clear()


func export_json() -> String:
	return JSON.stringify(graph.snapshot(), "  ")


## Import web/other-app JSON. Returns error text, or "" on success.
func import_json(text: String) -> String:
	var parsed: Variant = JSON.parse_string(text)
	if parsed is not Dictionary:
		return "invalid snapshot: expected version 1 graph"
	var snap: Dictionary = parsed
	if snap.get("version") != Graph.SNAPSHOT_VERSION:
		return "invalid snapshot: expected version 1 graph"
	if snap.get("nodes") is not Dictionary or snap.get("edges") is not Dictionary:
		return "invalid snapshot: expected version 1 graph"
	if snap.has("collapsedIds") and snap.get("collapsedIds") is not Array:
		return "invalid snapshot: collapsedIds must be an array"
	graph.restore(snap)
	return ""


func _schedule_save() -> void:
	_save_timer.start()


func _save_now() -> void:
	var file := FileAccess.open(STORAGE_PATH, FileAccess.WRITE)
	if file == null:
		push_error("graph save failed: %s" % error_string(FileAccess.get_open_error()))
		return
	file.store_string(JSON.stringify(graph.snapshot()))
	file.close()


func _load() -> void:
	if not FileAccess.file_exists(STORAGE_PATH):
		return
	var file := FileAccess.open(STORAGE_PATH, FileAccess.READ)
	if file == null:
		return
	var text := file.get_as_text()
	file.close()
	var parsed: Variant = JSON.parse_string(text)
	if parsed is Dictionary and parsed.get("version") == Graph.SNAPSHOT_VERSION:
		graph.restore(parsed)
