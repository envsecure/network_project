from flask import Flask, render_template, jsonify, request
from flask_cors import CORS
from network_monitor import NetworkMonitor
import threading
import time

app = Flask(__name__)
CORS(app)

monitor = NetworkMonitor()
scan_in_progress = False


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


if __name__ == "__main__":
    app.run(debug=True, host="0.0.0.0", port=5000)
