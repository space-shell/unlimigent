class_name PaseoGateway
extends Node
## Real daemon gateway over WebSocketPeer — the Gb probe formalized.
## Speaks the raw protocol (Spike Gb findings, MVP.md): hello → server_info,
## session-wrapped fetch requests, requestId-correlated responses, ping/pong
## keepalive. Push frames (agent_stream, providers_snapshot_update, …)
## trigger a debounced re-fetch so the graph tracks live agent state.
## Reconnect with exponential backoff. No CORS in native.

signal event_received(event: Dictionary)

const PING_INTERVAL_SEC := 15.0
const REFETCH_DEBOUNCE_SEC := 2.0
const BACKOFF_MIN_SEC := 1.0
const BACKOFF_MAX_SEC := 30.0
const TRANSCRIPT_CAP := 200

var url := "ws://100.127.193.39:6767/ws"
var daemon_host := "jn-server"
var poll_enabled := false

var _socket := WebSocketPeer.new()
var _connected := false
var _hello_sent := false
var _ping_at := 0.0
var _refetch_pending := false
var _refetch_at := 0.0
var _backoff := BACKOFF_MIN_SEC
var _reconnect_scheduled := false
var _listeners: Array[Callable] = []
var _request_seq := 0
var _agents_entries: Variant = null
var _workspaces_entries: Variant = null
## Live-accumulated transcripts from agent_stream timeline events. Daemon
## v0.8.0 has no timeline-fetch RPC ("Unknown request" on
## fetch_agent_timeline_request) — messages exist only from connect onward;
## re-probe on daemon upgrade.
var _transcripts: Dictionary = {}


## Recent chat messages for an agent (user/assistant), oldest first.
func get_transcript(agent_id: String) -> Array:
	var messages: Variant = _transcripts.get(agent_id)
	return messages.duplicate() if messages is Array else []


func _record_transcript(agent_id: String, event: Dictionary) -> void:
	var item: Dictionary = event.get("item", {})
	var item_type: String = item.get("type", "")
	if item_type != "user_message" and item_type != "assistant_message":
		return
	var text: Variant = item.get("text")
	if text == null or String(text) == "":
		return
	if not _transcripts.has(agent_id):
		_transcripts[agent_id] = [] as Array
	var messages: Array = _transcripts[agent_id]
	(
		messages
		. append(
			{
				"role": "user" if item_type == "user_message" else "agent",
				"text": String(text).strip_edges(),
				"at": event.get("timestamp", ""),
			}
		)
	)
	while messages.size() > TRANSCRIPT_CAP:
		messages.pop_front()


func start() -> void:
	poll_enabled = true
	_connect()


func stop() -> void:
	poll_enabled = false
	_socket.close()
	_set_connected(false, "stopped")


func subscribe(listener: Callable) -> Callable:
	_listeners.append(listener)
	var gateway := self
	return func() -> void: gateway._listeners.erase(listener)


func _connect() -> void:
	_reconnect_scheduled = false
	_hello_sent = false
	_agents_entries = null
	_workspaces_entries = null
	var err := _socket.connect_to_url(url)
	if err != OK:
		_emit(Gateway.connection_event("error", "connect failed: %d" % err))
		_schedule_reconnect()


func _process(delta: float) -> void:
	if not poll_enabled:
		return
	_ping_at += delta
	_socket.poll()
	var state := _socket.get_ready_state()
	if state == WebSocketPeer.STATE_OPEN:
		if not _hello_sent:
			_hello_sent = true
			_send(
				{
					"type": "hello",
					"clientId": "unlimigent",
					"clientType": "cli",
					"protocolVersion": 1,
					"capabilities": {},
				}
			)
		if _ping_at >= PING_INTERVAL_SEC:
			_ping_at = 0.0
			_send({"type": "ping"})
		if _refetch_pending:
			_refetch_at += delta
			if _refetch_at >= REFETCH_DEBOUNCE_SEC:
				_refetch_pending = false
				_fetch()
		while _socket.get_available_packet_count() > 0:
			_on_frame(_socket.get_packet().get_string_from_utf8())
	elif state == WebSocketPeer.STATE_CLOSED and _hello_sent:
		_on_closed()


func _on_closed() -> void:
	_hello_sent = false
	_set_connected(false, "closed code=%d" % _socket.get_close_code())
	_schedule_reconnect()


func _schedule_reconnect() -> void:
	if not poll_enabled or _reconnect_scheduled:
		return
	_reconnect_scheduled = true
	var wait := _backoff
	_backoff = minf(_backoff * 2.0, BACKOFF_MAX_SEC)
	get_tree().create_timer(wait).timeout.connect(_connect)


func _send(message: Dictionary) -> void:
	_socket.send_text(JSON.stringify(message))


func _request(type_name: String) -> String:
	_request_seq += 1
	var request_id := "unli-%s-%d" % [type_name, _request_seq]
	_send(
		{
			"type": "session",
			"message": {"type": type_name, "requestId": request_id},
		}
	)
	return request_id


func _fetch() -> void:
	_request("fetch_agents_request")
	_request("fetch_workspaces_request")


func _on_frame(text: String) -> void:
	var parsed: Variant = JSON.parse_string(text)
	if parsed is not Dictionary:
		return
	var frame: Dictionary = parsed
	if frame.get("type", "") != "session":
		return
	var message: Dictionary = frame.get("message", {})
	var message_type: String = message.get("type", "")
	var payload: Dictionary = message.get("payload", {})
	if message_type == "status":
		if payload.get("status", "") == "server_info":
			var hostname: Variant = payload.get("hostname")
			if hostname is String:
				daemon_host = hostname
			_set_connected(true)
			_fetch()
	elif message_type == "fetch_agents_response":
		_agents_entries = payload.get("entries", [])
		_try_emit_snapshot()
	elif message_type == "fetch_workspaces_response":
		_workspaces_entries = payload.get("entries", [])
		_try_emit_snapshot()
	elif (
		message_type
		in [
			"agent_stream",
			"project.update",
			"checkout_status_update",
			"providers_snapshot_update",
		]
	):
		if message_type == "agent_stream":
			_record_transcript(String(payload.get("agentId", "")), payload.get("event", {}))
		# live change signals — re-fetch soon rather than parsing partials
		_schedule_refetch()


func _try_emit_snapshot() -> void:
	if _agents_entries is Array and _workspaces_entries is Array:
		var snapshot := Gateway.snapshot_from_fetch(
			daemon_host, _workspaces_entries, _agents_entries
		)
		_agents_entries = null
		_workspaces_entries = null
		_emit(Gateway.snapshot_event(snapshot))


func _schedule_refetch() -> void:
	_refetch_pending = true
	_refetch_at = 0.0


func _set_connected(value: bool, detail: String = "") -> void:
	if value:
		_backoff = BACKOFF_MIN_SEC
	if _connected == value:
		return
	_connected = value
	_emit(Gateway.connection_event("connected" if value else "disconnected", detail))


func _emit(event: Dictionary) -> void:
	event_received.emit(event)
	for listener in _listeners.duplicate():
		listener.call(event)
