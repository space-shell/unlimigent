extends Node
## Spike Gb: daemon WS connectivity from a pad build. Speaks the raw daemon
## protocol (hello -> server_info -> fetch_* -> push frames; ping/pong
## keepalive). Active only when the `gb` flag is on — spike exports flip the
## default locally before building, never in committed code.

const URL := "ws://100.127.193.39:6767/ws"
const PING_INTERVAL := 15.0

var _socket := WebSocketPeer.new()
var _hello_sent := false
var _fetched := false
var _ping_at := 0.0


func _ready() -> void:
	if not Flags.is_on("gb"):
		set_process(false)
		return
	var err := _socket.connect_to_url(URL)
	print("gb: connect -> %s (err=%d)" % [URL, err])


func _process(delta: float) -> void:
	_ping_at += delta
	_socket.poll()
	var state := _socket.get_ready_state()
	if state == WebSocketPeer.STATE_OPEN:
		if not _hello_sent:
			_hello_sent = true
			_send(
				{
					"type": "hello",
					"clientId": "unlimigent-gb-probe",
					"clientType": "cli",
					"protocolVersion": 1,
					"capabilities": {},
				}
			)
		if _ping_at >= PING_INTERVAL:
			_ping_at = 0.0
			_send({"type": "ping"})
		while _socket.get_available_packet_count() > 0:
			_on_frame(_socket.get_packet().get_string_from_utf8())
	elif state == WebSocketPeer.STATE_CLOSED and _hello_sent:
		print(
			"gb: closed code=%d reason=%s" % [_socket.get_close_code(), _socket.get_close_reason()]
		)
		set_process(false)


func _send(message: Dictionary) -> void:
	_socket.send_text(JSON.stringify(message))
	print("gb: >> %s" % str(message).substr(0, 300))


func _on_frame(text: String) -> void:
	var parsed: Variant = JSON.parse_string(text)
	if parsed is not Dictionary:
		print("gb: << (non-json) %s" % text.substr(0, 200))
		return
	var msg: Dictionary = parsed
	var type: Variant = msg.get("type")
	if type == "session":
		var inner: Dictionary = msg.get("message", {})
		var payload: Dictionary = inner.get("payload", {})
		# agent_stream timeline floods logcat (reasoning-token deltas) —
		# summarize instead of printing every frame
		if inner.get("type") == "agent_stream":
			var event_type: String = payload.get("event", {}).get("type", "")
			if event_type == "timeline":
				return
			print("gb: << agent_stream/%s agent=%s" % [event_type, payload.get("agentId", "?")])
			return
		print("gb: << session/%s %s" % [inner.get("type"), str(payload).substr(0, 400)])
		if inner.get("type") == "status" and payload.get("status") == "server_info":
			_send_fetched()
	else:
		print("gb: << %s %s" % [type, text.substr(0, 200)])


func _send_fetched() -> void:
	if _fetched:
		return
	_fetched = true
	_send(
		{
			"type": "session",
			"message": {"type": "fetch_agents_request", "requestId": "gb-agents"},
		}
	)
	_send(
		{
			"type": "session",
			"message": {"type": "fetch_workspaces_request", "requestId": "gb-workspaces"},
		}
	)
