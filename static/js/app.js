const API = '';
let bandwidthHistory = [];
let chartCtx = null;
let refreshInterval = null;

document.addEventListener('DOMContentLoaded', () => {
    initTabs();
    initChart();
    loadDashboard();
    startAutoRefresh();
    initPing();
    initScanner();
});

function initTabs() {
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById('tab-' + btn.dataset.tab).classList.add('active');

            if (btn.dataset.tab === 'interfaces') loadInterfaces();
            if (btn.dataset.tab === 'connections') loadConnections();
        });
    });
}

function initChart() {
    const canvas = document.getElementById('bandwidth-chart');
    chartCtx = canvas.getContext('2d');
    canvas.width = canvas.offsetWidth;
    canvas.height = 200;
}

function startAutoRefresh() {
    refreshInterval = setInterval(loadDashboard, 2000);
}

async function loadDashboard() {
    try {
        const [summary, listening] = await Promise.all([
            fetch(API + '/api/summary').then(r => r.json()),
            fetch(API + '/api/listening').then(r => r.json())
        ]);

        updateHealth(summary.health);
        updateBandwidth(summary.bandwidth);
        updateStats(summary);
        updateListeningPorts(listening);
        updateBandwidthChart(summary.bandwidth);
    } catch (e) {
        console.error('Dashboard refresh error:', e);
    }
}

function updateHealth(health) {
    const score = health.score;
    const scoreText = document.getElementById('score-text');
    const scoreFill = document.getElementById('score-fill');
    const healthStatus = document.getElementById('health-status');
    const healthIssues = document.getElementById('health-issues');
    const gatewayDisplay = document.getElementById('gateway-display');
    const dnsDisplay = document.getElementById('dns-display');

    scoreText.textContent = score;
    const offset = 339.292 - (339.292 * score / 100);
    scoreFill.style.strokeDashoffset = offset;

    let color = 'var(--green)';
    if (score < 40) color = 'var(--red)';
    else if (score < 60) color = 'var(--orange)';
    else if (score < 80) color = 'var(--yellow)';
    scoreFill.style.stroke = color;

    healthStatus.textContent = health.status.charAt(0).toUpperCase() + health.status.slice(1) + ' Network';
    healthIssues.textContent = health.issues.length > 0 ? health.issues.join(' | ') : 'No issues detected';

    gatewayDisplay.textContent = 'Gateway: ' + (health.gateway || 'N/A');
    dnsDisplay.textContent = 'DNS: ' + (health.dns_servers.length > 0 ? health.dns_servers[0] : 'N/A');
}

function updateBandwidth(bw) {
    document.getElementById('upload-speed').textContent = formatBytes(bw.bytes_sent_rate) + '/s';
    document.getElementById('download-speed').textContent = formatBytes(bw.bytes_recv_rate) + '/s';
    document.getElementById('total-sent').textContent = formatBytes(bw.total_bytes_sent);
    document.getElementById('total-recv').textContent = formatBytes(bw.total_bytes_recv);
    document.getElementById('packets-sent').textContent = bw.packets_sent.toLocaleString();
    document.getElementById('packets-recv').textContent = bw.packets_recv.toLocaleString();
    document.getElementById('errors').textContent = (bw.errin + bw.errout).toLocaleString();
    document.getElementById('drops').textContent = (bw.dropin + bw.dropout).toLocaleString();
}

function updateStats(summary) {
    document.getElementById('open-ports').textContent = summary.listening_ports;
    document.getElementById('active-interfaces').textContent = summary.active_interfaces + '/' + summary.total_interfaces;
}

function updateListeningPorts(ports) {
    const tbody = document.getElementById('listening-tbody');
    tbody.innerHTML = ports.map(p => `
        <tr>
            <td><strong>${p.port}</strong></td>
            <td>${p.address}</td>
            <td>${p.process}</td>
            <td>${p.pid || '-'}</td>
        </tr>
    `).join('');
}

function updateBandwidthChart(bw) {
    bandwidthHistory.push({
        up: bw.bytes_sent_rate,
        down: bw.bytes_recv_rate,
        time: Date.now()
    });

    if (bandwidthHistory.length > 60) bandwidthHistory.shift();

    if (!chartCtx) return;
    const canvas = document.getElementById('bandwidth-chart');
    const w = canvas.width;
    const h = canvas.height;

    chartCtx.clearRect(0, 0, w, h);

    const maxVal = Math.max(
        ...bandwidthHistory.map(d => d.up),
        ...bandwidthHistory.map(d => d.down),
        1024
    );

    const step = w / (bandwidthHistory.length - 1 || 1);

    // Download line
    chartCtx.beginPath();
    chartCtx.strokeStyle = '#3b82f6';
    chartCtx.lineWidth = 2;
    bandwidthHistory.forEach((d, i) => {
        const x = i * step;
        const y = h - (d.down / maxVal) * (h - 20) - 10;
        i === 0 ? chartCtx.moveTo(x, y) : chartCtx.lineTo(x, y);
    });
    chartCtx.stroke();

    // Download fill
    chartCtx.beginPath();
    chartCtx.fillStyle = 'rgba(59, 130, 246, 0.1)';
    bandwidthHistory.forEach((d, i) => {
        const x = i * step;
        const y = h - (d.down / maxVal) * (h - 20) - 10;
        i === 0 ? chartCtx.moveTo(x, y) : chartCtx.lineTo(x, y);
    });
    chartCtx.lineTo(w, h);
    chartCtx.lineTo(0, h);
    chartCtx.fill();

    // Upload line
    chartCtx.beginPath();
    chartCtx.strokeStyle = '#22c55e';
    chartCtx.lineWidth = 2;
    bandwidthHistory.forEach((d, i) => {
        const x = i * step;
        const y = h - (d.up / maxVal) * (h - 20) - 10;
        i === 0 ? chartCtx.moveTo(x, y) : chartCtx.lineTo(x, y);
    });
    chartCtx.stroke();

    // Legend
    chartCtx.font = '12px Segoe UI';
    chartCtx.fillStyle = '#3b82f6';
    chartCtx.fillRect(10, 10, 12, 3);
    chartCtx.fillStyle = '#94a3b8';
    chartCtx.fillText('Download', 28, 15);

    chartCtx.fillStyle = '#22c55e';
    chartCtx.fillRect(100, 10, 12, 3);
    chartCtx.fillStyle = '#94a3b8';
    chartCtx.fillText('Upload', 118, 15);
}

async function loadInterfaces() {
    try {
        const data = await fetch(API + '/api/interfaces').then(r => r.json());
        const container = document.getElementById('interfaces-list');
        container.innerHTML = data.map(iface => `
            <div class="interface-card">
                <div class="interface-header">
                    <span class="interface-name">${iface.name}</span>
                    <span class="interface-status ${iface.is_up ? 'up' : 'down'}">${iface.is_up ? 'UP' : 'DOWN'}</span>
                </div>
                <div class="interface-details">
                    <div class="interface-detail">
                        <span class="interface-detail-label">Speed</span>
                        <span class="interface-detail-value">${iface.speed} Mbps</span>
                    </div>
                    <div class="interface-detail">
                        <span class="interface-detail-label">MTU</span>
                        <span class="interface-detail-value">${iface.mtu}</span>
                    </div>
                    <div class="interface-detail">
                        <span class="interface-detail-label">Sent</span>
                        <span class="interface-detail-value">${formatBytes(iface.bytes_sent)}</span>
                    </div>
                    <div class="interface-detail">
                        <span class="interface-detail-label">Received</span>
                        <span class="interface-detail-value">${formatBytes(iface.bytes_recv)}</span>
                    </div>
                    ${iface.addresses.filter(a => a.family.includes('AF_INET')).map(a => `
                        <div class="interface-detail" style="grid-column: 1/-1">
                            <span class="interface-detail-label">IPv4</span>
                            <span class="interface-detail-value">${a.address} / ${a.netmask || 'N/A'}</span>
                        </div>
                    `).join('')}
                </div>
            </div>
        `).join('');
    } catch (e) {
        console.error('Load interfaces error:', e);
    }
}

async function loadConnections() {
    try {
        const data = await fetch(API + '/api/connections').then(r => r.json());
        const tbody = document.getElementById('connections-tbody');
        tbody.innerHTML = data.slice(0, 100).map(c => {
            const statusClass = c.status === 'ESTABLISHED' ? 'established'
                : c.status === 'LISTEN' ? 'listen'
                : c.status === 'TIME_WAIT' ? 'time-wait'
                : c.status === 'CLOSE_WAIT' ? 'close-wait'
                : 'default';
            return `
                <tr>
                    <td>${c.laddr || '-'}</td>
                    <td>${c.raddr || '-'}</td>
                    <td><span class="status-badge ${statusClass}">${c.status}</span></td>
                    <td>${c.type.includes('SOCK_STREAM') ? 'TCP' : 'UDP'}</td>
                    <td>${c.pid || '-'}</td>
                </tr>
            `;
        }).join('');
    } catch (e) {
        console.error('Load connections error:', e);
    }
}

function initPing() {
    document.getElementById('ping-btn').addEventListener('click', async () => {
        const host = document.getElementById('ping-host').value.trim();
        if (!host) return;

        const resultDiv = document.getElementById('ping-result');
        const btn = document.getElementById('ping-btn');
        btn.disabled = true;
        resultDiv.textContent = 'Pinging ' + host + '...';

        try {
            const data = await fetch(API + '/api/ping?host=' + encodeURIComponent(host)).then(r => r.json());
            if (data.status === 'up') {
                resultDiv.innerHTML = `<span style="color: var(--green)">&#10003; ${data.host} is UP</span> - Latency: ${data.latency}ms`;
            } else {
                resultDiv.innerHTML = `<span style="color: var(--red)">&#10007; ${data.host} is DOWN</span>`;
            }
        } catch (e) {
            resultDiv.innerHTML = `<span style="color: var(--red)">Error: ${e.message}</span>`;
        }
        btn.disabled = false;
    });
}

function initScanner() {
    document.getElementById('scan-btn').addEventListener('click', async () => {
        const subnet = document.getElementById('scan-subnet').value.trim();
        const btn = document.getElementById('scan-btn');
        const status = document.getElementById('scan-status');

        btn.disabled = true;
        status.textContent = 'Scanning...';
        status.style.color = 'var(--yellow)';

        try {
            await fetch(API + '/api/scan', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ subnet: subnet || null })
            });

            const poll = setInterval(async () => {
                const data = await fetch(API + '/api/scan/results').then(r => r.json());
                if (!data.in_progress) {
                    clearInterval(poll);
                    btn.disabled = false;
                    status.textContent = data.devices.length + ' devices found';
                    status.style.color = 'var(--green)';
                    renderDevices(data.devices);
                }
            }, 1000);
        } catch (e) {
            btn.disabled = false;
            status.textContent = 'Scan failed: ' + e.message;
            status.style.color = 'var(--red)';
        }
    });
}

function renderDevices(devices) {
    const grid = document.getElementById('devices-grid');
    grid.innerHTML = devices.map(d => `
        <div class="device-card">
            <div class="device-icon">&#128225;</div>
            <div class="device-ip">${d.ip}</div>
            <div class="device-mac">${d.mac}</div>
            <div class="device-vendor">${d.vendor}</div>
        </div>
    `).join('');
}

function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}
