import psutil
import socket
import time
import threading
import platform
from datetime import datetime, timedelta

try:
    import netifaces
except ImportError:
    netifaces = None

try:
    from scapy.all import ARP, Ether, srp, conf
    SCAPY_AVAILABLE = True
except ImportError:
    SCAPY_AVAILABLE = False


class NetworkMonitor:
    def __init__(self):
        self.previous_io = None
        self.previous_time = None
        self.bandwidth_history = []
        self.ping_history = []
        self.dns_history = []
        self.scan_results = []

    def get_interface_info(self):
        interfaces = []
        addrs = psutil.net_if_addrs()
        stats = psutil.net_if_stats()
        io_counters = psutil.net_io_counters(pernic=True)

        for iface_name, iface_addrs in addrs.items():
            info = {
                "name": iface_name,
                "addresses": [],
                "is_up": False,
                "speed": 0,
                "mtu": 0,
                "bytes_sent": 0,
                "bytes_recv": 0,
            }

            if iface_name in stats:
                info["is_up"] = stats[iface_name].isup
                info["speed"] = stats[iface_name].speed
                info["mtu"] = stats[iface_name].mtu

            if iface_name in io_counters:
                info["bytes_sent"] = io_counters[iface_name].bytes_sent
                info["bytes_recv"] = io_counters[iface_name].bytes_recv

            for addr in iface_addrs:
                addr_info = {"family": str(addr.family), "address": addr.address}
                if addr.netmask:
                    addr_info["netmask"] = addr.netmask
                if addr.broadcast:
                    addr_info["broadcast"] = addr.broadcast
                info["addresses"].append(addr_info)

            interfaces.append(info)

        return interfaces

    def get_bandwidth(self):
        current_io = psutil.net_io_counters()
        current_time = time.time()

        if self.previous_io and self.previous_time:
            elapsed = current_time - self.previous_time
            if elapsed > 0:
                bytes_sent_rate = (
                    current_io.bytes_sent - self.previous_io.bytes_sent
                ) / elapsed
                bytes_recv_rate = (
                    current_io.bytes_recv - self.previous_io.bytes_recv
                ) / elapsed

                self.previous_io = current_io
                self.previous_time = current_time

                return {
                    "bytes_sent_rate": round(bytes_sent_rate),
                    "bytes_recv_rate": round(bytes_recv_rate),
                    "total_bytes_sent": current_io.bytes_sent,
                    "total_bytes_recv": current_io.bytes_recv,
                    "packets_sent": current_io.packets_sent,
                    "packets_recv": current_io.packets_recv,
                    "errin": current_io.errin,
                    "errout": current_io.errout,
                    "dropin": current_io.dropin,
                    "dropout": current_io.dropout,
                }

        self.previous_io = current_io
        self.previous_time = current_time
        return {
            "bytes_sent_rate": 0,
            "bytes_recv_rate": 0,
            "total_bytes_sent": current_io.bytes_sent,
            "total_bytes_recv": current_io.bytes_recv,
            "packets_sent": current_io.packets_sent,
            "packets_recv": current_io.packets_recv,
            "errin": current_io.errin,
            "errout": current_io.errout,
            "dropin": current_io.dropin,
            "dropout": current_io.dropout,
        }

    def get_connections(self):
        connections = []
        for conn in psutil.net_connections(kind="inet"):
            connections.append({
                "fd": conn.fd,
                "family": str(conn.family),
                "type": str(conn.type),
                "laddr": f"{conn.laddr.ip}:{conn.laddr.port}" if conn.laddr else "",
                "raddr": f"{conn.raddr.ip}:{conn.raddr.port}" if conn.raddr else "",
                "status": conn.status,
                "pid": conn.pid,
            })
        return connections

    def get_listening_ports(self):
        listening = []
        for conn in psutil.net_connections(kind="inet"):
            if conn.status == "LISTEN":
                try:
                    proc_name = ""
                    if conn.pid:
                        proc = psutil.Process(conn.pid)
                        proc_name = proc.name()
                except (psutil.NoSuchProcess, psutil.AccessDenied):
                    proc_name = "unknown"

                listening.append({
                    "port": conn.laddr.port,
                    "address": conn.laddr.ip,
                    "pid": conn.pid,
                    "process": proc_name,
                })
        return listening

    def ping_host(self, host, timeout=3):
        param = "-n" if platform.system().lower() == "windows" else "-c"
        timeout_param = "-w" if platform.system().lower() == "windows" else "-W"
        try:
            output = psutil.popen(
                f"ping {param} 1 {timeout_param} {timeout} {host}"
            ).read()
            if "TTL=" in output or "ttl=" in output:
                for line in output.split("\n"):
                    if "time=" in line.lower() or "time<" in line.lower():
                        import re
                        match = re.search(r"time[<=](\d+\.?\d*)", line.lower())
                        if match:
                            return {"host": host, "latency": float(match.group(1)), "status": "up"}
                return {"host": host, "latency": 0, "status": "up"}
            return {"host": host, "latency": -1, "status": "down"}
        except Exception as e:
            return {"host": host, "latency": -1, "status": "error", "error": str(e)}

    def get_default_gateway(self):
        try:
            gws = psutil.net_if_stats()
            if netifaces:
                gateways = netifaces.gateways()
                default = gateways.get("default", {})
                gw_addr = default.get(netifaces.AF_INET, [None, None])[0]
                return gw_addr
        except Exception:
            pass
        return None

    def get_dns_servers(self):
        try:
            if platform.system().lower() == "windows":
                output = psutil.popen("ipconfig /all").read()
                servers = []
                for line in output.split("\n"):
                    if "DNS Servers" in line:
                        parts = line.split(":")
                        if len(parts) > 1:
                            servers.append(parts[1].strip())
                return servers
            else:
                with open("/etc/resolv.conf") as f:
                    servers = []
                    for line in f:
                        if line.startswith("nameserver"):
                            servers.append(line.split()[1])
                    return servers
        except Exception:
            return []

    def get_network_health(self):
        gateway = self.get_default_gateway()
        dns = self.get_dns_servers()
        io = psutil.net_io_counters()

        health_score = 100
        issues = []

        gateway_ping = self.ping_host(gateway) if gateway else None
        if gateway_ping and gateway_ping["status"] == "down":
            health_score -= 30
            issues.append("Gateway unreachable")
        elif gateway_ping and gateway_ping["latency"] > 50:
            health_score -= 10
            issues.append("High gateway latency")

        if dns:
            dns_ping = self.ping_host(dns[0])
            if dns_ping and dns_ping["status"] == "down":
                health_score -= 20
                issues.append("DNS server unreachable")
            elif dns_ping and dns_ping["latency"] > 30:
                health_score -= 5
                issues.append("High DNS latency")
        else:
            health_score -= 10
            issues.append("No DNS servers configured")

        if io.errin > 100 or io.errout > 100:
            health_score -= 15
            issues.append(f"Network errors detected (in:{io.errin}, out:{io.errout})")

        if io.dropin > 50 or io.dropout > 50:
            health_score -= 15
            issues.append(f"Packet loss detected (in:{io.dropin}, out:{io.dropout})")

        if health_score < 0:
            health_score = 0

        if health_score >= 80:
            status = "excellent"
        elif health_score >= 60:
            status = "good"
        elif health_score >= 40:
            status = "fair"
        else:
            status = "poor"

        return {
            "score": health_score,
            "status": status,
            "issues": issues,
            "gateway": gateway,
            "dns_servers": dns,
            "timestamp": datetime.now().isoformat(),
        }

    def scan_network(self, subnet=None):
        if not SCAPY_AVAILABLE:
            return {"error": "scapy not available", "devices": []}

        if not subnet:
            try:
                if netifaces:
                    addrs = netifaces.ifaddresses(netifaces.AF_INET)
                    for iface in addrs.values():
                        if iface and iface[0]:
                            ip = iface[0]["addr"]
                            netmask = iface[0].get("netmask", "255.255.255.0")
                            import ipaddress
                            network = ipaddress.IPv4Network(
                                f"{ip}/{netmask}", strict=False
                            )
                            subnet = str(network)
                            break
                if not subnet:
                    hostname = socket.gethostname()
                    local_ip = socket.gethostbyname(hostname)
                    subnet = f"{local_ip.rsplit('.', 1)[0]}.0/24"
            except Exception:
                subnet = "192.168.1.0/24"

        try:
            conf.verb = 0
            arp = ARP(pdst=subnet)
            ether = Ether(dst="ff:ff:ff:ff:ff:ff")
            packet = ether / arp
            result = srp(packet, timeout=3, verbose=False)[0]

            devices = []
            for sent, received in result:
                devices.append({
                    "ip": received.psrc,
                    "mac": received.hwsrc,
                    "vendor": self._get_mac_vendor(received.hwsrc),
                })

            self.scan_results = devices
            return {"devices": devices, "subnet": subnet, "count": len(devices)}
        except Exception as e:
            return {"error": str(e), "devices": []}

    def _get_mac_vendor(self, mac):
        prefix = mac[:8].upper().replace(":", "")
        vendors = {
            "005056": "VMware",
            "000C29": "VMware",
            "001C42": "Parallels",
            "080027": "Oracle VirtualBox",
            "525400": "QEMU/KVM",
            "00163E": "Xen",
            "00155D": "Microsoft Hyper-V",
            "3C22FB": "Apple",
            "A483E7": "Apple",
            "F8FFC2": "Apple",
            "DCA632": "Raspberry Pi",
            "B827EB": "Raspberry Pi",
            "001A11": "Google",
            "3C5AB4": "Google",
            "F4F5D8": "Google",
            "00E04C": "Realtek",
            "525400": "QEMU",
        }
        return vendors.get(prefix, "Unknown")

    def get_wifi_info(self):
        try:
            if platform.system().lower() == "windows":
                output = psutil.popen("netsh wlan show interfaces").read()
                info = {}
                for line in output.split("\n"):
                    line = line.strip()
                    if ":" in line:
                        parts = line.split(":", 1)
                        key = parts[0].strip()
                        val = parts[1].strip()
                        if key == "SSID":
                            info["ssid"] = val
                        elif key == "Signal":
                            info["signal"] = val
                        elif key == "Speed":
                            info["speed"] = val
                        elif key == "Radio type":
                            info["radio"] = val
                        elif key == "Channel":
                            info["channel"] = val
                return info
        except Exception:
            pass
        return {}
