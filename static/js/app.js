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
    canvas.height = 180;
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
    else if (score < 60) color = 'var(--yellow)';
    scoreFill.style.stroke = color;

    healthStatus.textContent = health.status;
    healthIssues.textContent = health.issues.length > 0 ? health.issues.join(' // ') : 'no issues';

    gatewayDisplay.textContent = 'gw: ' + (health.gateway || 'none');
    dnsDisplay.textContent = 'dns: ' + (health.dns_servers.length > 0 ? health.dns_servers[0] : 'none');
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
            <td>${p.port}</td>
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

    // Grid lines
    chartCtx.strokeStyle = '#e8e8e8';
    chartCtx.lineWidth = 1;
    for (let i = 0; i < 5; i++) {
        const y = (h / 5) * i + 10;
        chartCtx.beginPath();
        chartCtx.moveTo(0, y);
        chartCtx.lineTo(w, y);
        chartCtx.stroke();
    }

    const maxVal = Math.max(
        ...bandwidthHistory.map(d => d.up),
        ...bandwidthHistory.map(d => d.down),
        1024
    );

    const step = w / (bandwidthHistory.length - 1 || 1);

    // Download line
    chartCtx.beginPath();
    chartCtx.strokeStyle = '#1a1a1a';
    chartCtx.lineWidth = 1.5;
    bandwidthHistory.forEach((d, i) => {
        const x = i * step;
        const y = h - (d.down / maxVal) * (h - 30) - 15;
        i === 0 ? chartCtx.moveTo(x, y) : chartCtx.lineTo(x, y);
    });
    chartCtx.stroke();

    // Download dots
    bandwidthHistory.forEach((d, i) => {
        if (i % 5 === 0 || i === bandwidthHistory.length - 1) {
            const x = i * step;
            const y = h - (d.down / maxVal) * (h - 30) - 15;
            chartCtx.fillStyle = '#1a1a1a';
            chartCtx.fillRect(x - 2, y - 2, 4, 4);
        }
    });

    // Upload line
    chartCtx.beginPath();
    chartCtx.strokeStyle = '#888888';
    chartCtx.lineWidth = 1;
    chartCtx.setLineDash([4, 4]);
    bandwidthHistory.forEach((d, i) => {
        const x = i * step;
        const y = h - (d.up / maxVal) * (h - 30) - 15;
        i === 0 ? chartCtx.moveTo(x, y) : chartCtx.lineTo(x, y);
    });
    chartCtx.stroke();
    chartCtx.setLineDash([]);

    // Legend
    chartCtx.font = '10px IBM Plex Mono, Courier New, monospace';
    chartCtx.fillStyle = '#1a1a1a';
    chartCtx.fillRect(10, 8, 12, 2);
    chartCtx.fillStyle = '#888888';
    chartCtx.fillText('download', 28, 12);

    chartCtx.fillStyle = '#888888';
    chartCtx.fillRect(100, 8, 12, 2);
    chartCtx.fillText('upload', 118, 12);
}

async function loadInterfaces() {
    try {
        const data = await fetch(API + '/api/interfaces').then(r => r.json());
        const container = document.getElementById('interfaces-list');
        container.innerHTML = data.map(iface => `
            <div class="interface-card">
                <div class="interface-header">
                    <span class="interface-name">${iface.name}</span>
                    <span class="interface-status ${iface.is_up ? 'up' : 'down'}">${iface.is_up ? 'up' : 'down'}</span>
                </div>
                <div class="interface-details">
                    <div class="interface-detail">
                        <span class="interface-detail-label">speed</span>
                        <span class="interface-detail-value">${iface.speed} Mbps</span>
                    </div>
                    <div class="interface-detail">
                        <span class="interface-detail-label">mtu</span>
                        <span class="interface-detail-value">${iface.mtu}</span>
                    </div>
                    <div class="interface-detail">
                        <span class="interface-detail-label">sent</span>
                        <span class="interface-detail-value">${formatBytes(iface.bytes_sent)}</span>
                    </div>
                    <div class="interface-detail">
                        <span class="interface-detail-label">recv</span>
                        <span class="interface-detail-value">${formatBytes(iface.bytes_recv)}</span>
                    </div>
                    ${iface.addresses.filter(a => a.family.includes('AF_INET')).map(a => `
                        <div class="interface-detail" style="grid-column: 1/-1">
                            <span class="interface-detail-label">ipv4</span>
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
                    <td><span class="status-badge ${statusClass}">${c.status.toLowerCase()}</span></td>
                    <td>${c.type.includes('SOCK_STREAM') ? 'tcp' : 'udp'}</td>
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
        resultDiv.textContent = '> ping ' + host;

        try {
            const data = await fetch(API + '/api/ping?host=' + encodeURIComponent(host)).then(r => r.json());
            if (data.status === 'up') {
                resultDiv.innerHTML = `> ${data.host} is up <span style="color:var(--green)">[ok]</span> // ${data.latency}ms`;
            } else {
                resultDiv.innerHTML = `> ${data.host} is down <span style="color:var(--red)">[fail]</span>`;
            }
        } catch (e) {
            resultDiv.innerHTML = `> error: ${e.message}`;
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
        status.textContent = 'scanning...';
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
                    status.textContent = data.devices.length + ' found';
                    status.style.color = 'var(--green)';
                    renderDevices(data.devices);
                }
            }, 1000);
        } catch (e) {
            btn.disabled = false;
            status.textContent = 'error: ' + e.message;
            status.style.color = 'var(--red)';
        }
    });
}

function renderDevices(devices) {
    const grid = document.getElementById('devices-grid');
    grid.innerHTML = devices.map(d => `
        <div class="device-card">
            <div class="device-icon">[device]</div>
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
