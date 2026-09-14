extends Node
## Typed, default-off feature flags, persisted to user://settings.cfg.
## Policy (AGENTS.md): flags are named after stages or features, default-off,
## removed after one release cycle at default-on. No long-lived toggles.

const STORAGE_PATH := "user://settings.cfg"
const STORAGE_SECTION := "flags"
const FLAG_NAMES: PackedStringArray = [
	"g1",
	"g2",
	"g3",
	"g4",
	"g5",
	"g6",
	"voice",
	"gb",
]

var _state := _defaults()


func _ready() -> void:
	_load()


func is_on(flag_name: String) -> bool:
	return _state.get(flag_name, false)


func set_flag(flag_name: String, value: bool) -> void:
	if not FLAG_NAMES.has(flag_name):
		push_error("unknown flag: %s" % flag_name)
		return
	_state[flag_name] = value
	_save()


func reset() -> void:
	_state = _defaults()
	_save()


func snapshot() -> Dictionary:
	return _state.duplicate(true)


func _defaults() -> Dictionary:
	return {
		"g1": false,
		"g2": false,
		"g3a": false,
		"g3b": false,
		"g4": false,
		"g5": false,
		"g6": false,
		"voice": false,
		"gb": false,
	}


func _load() -> void:
	var cfg := ConfigFile.new()
	if cfg.load(STORAGE_PATH) != OK:
		return
	for flag_name in FLAG_NAMES:
		var value: Variant = cfg.get_value(STORAGE_SECTION, flag_name, null)
		if value is bool:
			_state[flag_name] = value


func _save() -> void:
	var cfg := ConfigFile.new()
	for flag_name in FLAG_NAMES:
		cfg.set_value(STORAGE_SECTION, flag_name, _state[flag_name])
	cfg.save(STORAGE_PATH)
