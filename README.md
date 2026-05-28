# NetMonitor

Real-time network health monitoring system with a clean web dashboard.

![Python](https://img.shields.io/badge/Python-3.7+-blue)
![Flask](https://img.shields.io/badge/Flask-3.0.0-green)
![License](https://img.shields.io/badge/License-MIT-yellow)

---

## Features

- **Network Health Scoring** - 0-100 score based on gateway, DNS, errors, drops
- **Real-Time Monitoring** - Live updates via WebSocket every second
- **Bandwidth Tracking** - Upload/download speed with live charts
- **Device Scanner** - ARP scan to discover network devices
- **Connection Tracking** - All TCP/UDP connections with status
- **Analytics Dashboard** - Protocol distribution, traffic ratio, top ports
- **Ping Tool** - Quick connectivity test from the UI
- **Passive Monitoring** - Reads OS counters with zero network impact

---

## Screenshots

> Add screenshots here

**Dashboard**

![Dashboard](screenshots/dashboard.png)

**Analytics**

![Analytics](screenshots/analytics.png)

**Device Scanner**

![Scanner](screenshots/scanner.png)

---

## Installation

### Linux

```bash
git clone https://github.com/yourusername/netmonitor.git
cd netmonitor

python3 -m venv venv
source venv/bin/activate

pip install -r requirements.txt

python app.py
```

### Windows

```bash
git clone https://github.com/yourusername/netmonitor.git
cd netmonitor

pip install -r requirements.txt

python app.py
```

Open **http://localhost:5000** in your browser.

---

## Usage

### Dashboard

The dashboard shows:

| Component | Description |
|-----------|-------------|
| Health Score | Network health 0-100 with color indicator |
| Upload/Download Speed | Current bandwidth rates |
| Bandwidth Chart | Live line chart (blue=download, green=upload) |
| Errors Chart | Network errors and packet drops |
| Connection Status | Pie chart of connection states |
| Top Ports | Horizontal bar chart of most-used ports |
| Ping Tool | Test connectivity to any host |

### Analytics Tab

5 advanced charts:

- Bandwidth per interface (grouped bar)
- Connection count trend (line)
- Protocol distribution - TCP vs UDP (pie)
- Top ports by connections (horizontal bar)
- Sent vs received traffic ratio (donut)

### Interfaces Tab

- Interface traffic comparison chart
- Interface cards with speed, MTU, IP, traffic stats

### Connections Tab

- Full table of active connections
- Status badges (established, listen, time_wait, etc.)

### Device Scanner

- Enter subnet or leave empty for auto-detect
- Click scan to discover devices
- Shows IP, MAC, and vendor for each device

---

## Tech Stack

| Component | Technology |
|-----------|------------|
| Backend | Python, Flask |
| WebSocket | flask-sock |
| Monitoring | psutil |
| ARP Scan | scapy (optional) |
| Interface Info | netifaces (optional) |
| Frontend | HTML5, CSS3, JavaScript |
| Charts | Canvas API (no libraries) |
| Design | Retro minimal white |

---

## Project Structure

```
netmonitor/
|-- app.py                  # Flask server and API routes
|-- network_monitor.py      # Network monitoring core
|-- requirements.txt        # Python dependencies
|-- README.md               # This file
|-- templates/
|   |-- index.html          # HTML template
|-- static/
|   |-- css/
|   |   |-- style.css       # Styling
|   |-- js/
|       |-- app.js          # Frontend logic and charts
|-- docs/
    |-- overview.md         # System overview
    |-- architecture.md     # Architecture docs
    |-- backend.md          # Backend docs
    |-- security.md         # Security analysis
    |-- submission.md       # Project submission
```

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/summary` | Full dashboard data |
| GET | `/api/health` | Network health score |
| GET | `/api/bandwidth` | Bandwidth rates and totals |
| GET | `/api/interfaces` | Network interface info |
| GET | `/api/connections` | Active connections |
| GET | `/api/listening` | Listening ports |
| GET | `/api/ping?host=` | Ping a host |
| POST | `/api/scan` | Start ARP scan |
| GET | `/api/scan/results` | Get scan results |
| GET | `/api/analytics/connections` | Connection analytics |
| GET | `/api/analytics/traffic-ratio` | Sent vs received |
| GET | `/api/analytics/iface-bandwidth` | Per-interface bandwidth |
| WS | `/ws` | WebSocket real-time updates |

---

## Security

- Generates only standard ICMP and ARP packets
- Passive monitoring reads OS counters with zero traffic
- No data exfiltration - all data stays local
- No system modification - read-only access
- All code is transparent and auditable

See [docs/security.md](docs/security.md) for full security analysis.

---

## Requirements

| Package | Version | Required |
|---------|---------|----------|
| flask | 3.0.0 | Yes |
| flask-cors | 4.0.0 | Yes |
| flask-sock | 0.7.0 | Yes |
| psutil | 5.9.8 | Yes |
| scapy | 2.5.0 | For device scanning |
| netifaces | 0.11.0 | For gateway detection |
| requests | 2.31.0 | Optional |

---

## Platform Support

| Platform | Status |
|----------|--------|
| Linux | Fully supported |
| Windows | Fully supported |
| macOS | Supported (minor differences) |

---

## License

MIT License

---

## Author

Your Name

---

## Acknowledgments

- [psutil](https://github.com/giampaolo/psutil) - Cross-platform system monitoring
- [Flask](https://flask.palletsprojects.com/) - Lightweight web framework
- [Scapy](https://scapy.net/) - Packet manipulation library
