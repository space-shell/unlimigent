extends Node
## IntentBus autoload — port of src/intents/bus.ts. Every input source
## (touch, gamepad, speech) normalizes into intents here; nothing else in
## the game may read raw input events.

## Canonical intent taxonomy (G-world): ship.* replaces web camera-centric
## nav; camera.* survives for world-browsing. Extend deliberately.
const TYPES: PackedStringArray = [
	"ship.thrust",
	"ship.brake",
	"ship.dock",
	"ship.undock",
	"nav.jump",
	"nav.back",
	"node.activate",
	"node.context",
	"camera.pan",
	"camera.zoom",
	"camera.focus",
	"ui.menu",
	"ui.back",
	"ui.voice",
]
const SOURCES: PackedStringArray = ["touch", "gamepad", "gaze", "voice", "system"]
const LOG_LIMIT := 200

var _handlers: Dictionary = {}
var _any_handlers: Array[Callable] = []
var _seq := 0
var _log: Array = []


## Subscribe to one intent type. Returns an unsubscribe callable.
func on(type_name: String, handler: Callable) -> Callable:
	if not _handlers.has(type_name):
		_handlers[type_name] = [] as Array[Callable]
	(_handlers[type_name] as Array[Callable]).append(handler)
	var bus := self
	return func() -> void: bus.off(type_name, handler)


## Subscribe to every intent. Returns an unsubscribe callable.
func on_any(handler: Callable) -> Callable:
	_any_handlers.append(handler)
	var bus := self
	return func() -> void: bus.off_any(handler)


func off(type_name: String, handler: Callable) -> void:
	if not _handlers.has(type_name):
		return
	(_handlers[type_name] as Array[Callable]).erase(handler)


func off_any(handler: Callable) -> void:
	_any_handlers.erase(handler)


func dispatch(intent: Dictionary) -> void:
	_seq += 1
	_log.append(intent)
	if _log.size() > LOG_LIMIT:
		_log.pop_front()
	var type_name: Variant = intent.get("type", "")
	if _handlers.has(type_name):
		for handler in (_handlers[type_name] as Array[Callable]).duplicate():
			handler.call(intent)
	for handler in _any_handlers.duplicate():
		handler.call(intent)


func recent() -> Array:
	return _log


func clear_log() -> void:
	_log = []
