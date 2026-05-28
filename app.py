from flask import Flask, render_template, jsonify, request
from flask_cors import CORS
from flask_sock import Sock
from network_monitor import NetworkMonitor
import threading
import time
import json

app = Flask(__name__)
CORS(app)
sock = Sock(app)

monitor = NetworkMonitor()
scan_in_progress = False
ws_clients = []


def broadcast_data():
    while True:
        if ws_clients:
            try:
                health = monitor.get_network_health()
                bandwidth = monitor.get_bandwidth()
                interfaces = monitor.get_interface_info()
                listening = monitor.get_listening_ports()
                active_ifaces = sum(1 for i in interfaces if i["is_up"])

                data = json.dumps({
                    "type": "update",
                    "health": health,
                    "bandwidth": bandwidth,
                    "active_interfaces": active_ifaces,
                    "total_interfaces": len(interfaces),
                    "listening_ports": len(listening),
                    "connection_count": len(monitor.get_connections()),
                    "timestamp": time.time(),
                })

                for client in ws_clients[:]:
                    try:
                        client.send(data)
                    except Exception:
                        ws_clients.remove(client)
            except Exception:
                pass
        time.sleep(1)


broadcast_thread = threading.Thread(target=broadcast_data, daemon=True)
broadcast_thread.start()


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/interfaces")
def api_interfaces():
    return jsonify(monitor.get_interface_info())


@app.route("/api/bandwidth")
def api_bandwidth():
    return jsonify(monitor.get_bandwidth())


@app.route("/api/connections")
def api_connections():
    return jsonify(monitor.get_connections())


@app.route("/api/listening")
def api_listening():
    return jsonify(monitor.get_listening_ports())


@app.route("/api/health")
def api_health():
    return jsonify(monitor.get_network_health())


@app.route("/api/scan", methods=["POST"])
def api_scan():
    global scan_in_progress
    if scan_in_progress:
        return jsonify({"error": "Scan already in progress"}), 409

    data = request.get_json() or {}
    subnet = data.get("subnet")

    def do_scan():
        global scan_in_progress
        scan_in_progress = True
        result = monitor.scan_network(subnet)
        scan_in_progress = False

    thread = threading.Thread(target=do_scan)
    thread.daemon = True
    thread.start()
    return jsonify({"message": "Scan started"})


@app.route("/api/scan/results")
def api_scan_results():
    return jsonify({"devices": monitor.scan_results, "in_progress": scan_in_progress})


@app.route("/api/ping")
def api_ping():
    host = request.args.get("host", "8.8.8.8")
    return jsonify(monitor.ping_host(host))


@app.route("/api/dns")
def api_dns():
    return jsonify({"servers": monitor.get_dns_servers()})


@app.route("/api/gateway")
def api_gateway():
    return jsonify({"gateway": monitor.get_default_gateway()})


@app.route("/api/wifi")
def api_wifi():
    return jsonify(monitor.get_wifi_info())


@app.route("/api/summary")
def api_summary():
    health = monitor.get_network_health()
    bandwidth = monitor.get_bandwidth()
    interfaces = monitor.get_interface_info()
    listening = monitor.get_listening_ports()
    wifi = monitor.get_wifi_info()

    active_ifaces = sum(1 for i in interfaces if i["is_up"])
    total_ifaces = len(interfaces)

    return jsonify({
        "health": health,
        "bandwidth": bandwidth,
        "active_interfaces": active_ifaces,
        "total_interfaces": total_ifaces,
        "listening_ports": len(listening),
        "wifi": wifi,
        "timestamp": time.time(),
    })


@app.route("/api/analytics/iface-bandwidth")
def api_analytics_iface_bandwidth():
    interfaces = monitor.get_interface_info()
    return jsonify([{
        "name": i["name"],
        "sent": i["bytes_sent"],
        "recv": i["bytes_recv"],
        "up": i["is_up"]
    } for i in interfaces])


@app.route("/api/analytics/connections")
def api_analytics_connections():
    connections = monitor.get_connections()
    status_counts = {}
    type_counts = {"tcp": 0, "udp": 0}
    port_counts = {}

    for c in connections:
        s = c["status"]
        status_counts[s] = status_counts.get(s, 0) + 1

        if "SOCK_STREAM" in c["type"]:
            type_counts["tcp"] += 1
        else:
            type_counts["udp"] += 1

        if c["laddr"]:
            port = c["laddr"].split(":")[-1]
            port_counts[port] = port_counts.get(port, 0) + 1

    top_ports = sorted(port_counts.items(), key=lambda x: x[1], reverse=True)[:10]

    return jsonify({
        "total": len(connections),
        "by_status": status_counts,
        "by_type": type_counts,
        "top_ports": [{"port": p, "count": c} for p, c in top_ports],
    })


@app.route("/api/analytics/traffic-ratio")
def api_analytics_traffic_ratio():
    interfaces = monitor.get_interface_info()
    total_sent = sum(i["bytes_sent"] for i in interfaces)
    total_recv = sum(i["bytes_recv"] for i in interfaces)
    return jsonify({"sent": total_sent, "recv": total_recv})


@sock.route("/ws")
def websocket(ws):
    ws_clients.append(ws)
    try:
        while True:
            ws.receive()
    except Exception:
        pass
    finally:
        if ws in ws_clients:
            ws_clients.remove(ws)


if __name__ == "__main__":
    app.run(debug=True, host="0.0.0.0", port=5000)
