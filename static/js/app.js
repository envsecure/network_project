const API = '';
let bandwidthHistory = [];
let errorsHistory = [];
let packetsHistory = [];
let interfaceData = {};
let connectionStatuses = {};
let refreshInterval = null;

// Chart contexts
let bwCtx, errCtx, pktCtx, ifaceCtx, connCtx;

document.addEventListener('DOMContentLoaded', () => {
    initTabs();
    initCharts();
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

function initCharts() {
    bwCtx = setupCanvas('bandwidth-chart');
    errCtx = setupCanvas('errors-chart');
    pktCtx = setupCanvas('packets-chart');
    ifaceCtx = setupCanvas('interface-chart');
    connCtx = setupCanvas('connection-status-chart');
}

function setupCanvas(id) {
    const canvas = document.getElementById(id);
    if (!canvas) return null;
    const ctx = canvas.getContext('2d');
    canvas.width = canvas.offsetWidth;
    canvas.height = 180;
    return ctx;
}

function startAutoRefresh() {
    refreshInterval = setInterval(loadDashboard, 2000);
}

async function loadDashboard() {
    try {
        const [summary, listening, bandwidth, interfaces] = await Promise.all([
            fetch(API + '/api/summary').then(r => r.json()),
            fetch(API + '/api/listening').then(r => r.json()),
            fetch(API + '/api/bandwidth').then(r => r.json()),
            fetch(API + '/api/interfaces').then(r => r.json())
        ]);

        updateHealth(summary.health);
        updateBandwidth(summary.bandwidth);
        updateStats(summary);
        updateListeningPorts(listening);
        updateListeningPortsSmall(listening);
        updateBandwidthChart(summary.bandwidth);
        updateErrorsChart(summary.bandwidth);
        updatePacketsChart(summary.bandwidth);
        updateInterfaceChart(interfaces);
        updateConnectionStatusChart();
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
    healthIssues.textContent = health.issues.length > 0 ? health.issues.join(' // ') : 'no issues detected';

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

function updateListeningPortsSmall(ports) {
    const tbody = document.getElementById('listening-tbody-small');
    tbody.innerHTML = ports.slice(0, 8).map(p => `
        <tr>
            <td>${p.port}</td>
            <td>${p.process}</td>
            <td>${p.pid || '-'}</td>
        </tr>
    `).join('');
}

// ========== CHARTS ==========

function drawGrid(ctx, w, h, rows) {
    ctx.strokeStyle = '#e0e0e0';
    ctx.lineWidth = 1;
    for (let i = 0; i <= rows; i++) {
        const y = (h / rows) * i + 8;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
    }
}

function drawLabels(ctx, w, h, maxVal, rows) {
    ctx.font = '10px IBM Plex Mono, Courier New, monospace';
    ctx.fillStyle = '#888888';
    ctx.textAlign = 'right';
    for (let i = 0; i <= rows; i++) {
        const y = (h / rows) * i + 12;
        const val = maxVal - (maxVal / rows) * i;
        ctx.fillText(formatBytesShort(val), 45, y);
    }
    ctx.textAlign = 'left';
}

function drawLegend(ctx, items) {
    let x = 10;
    ctx.font = '10px IBM Plex Mono, Courier New, monospace';
    items.forEach(item => {
        ctx.fillStyle = item.color;
        ctx.fillRect(x, 6, 12, 3);
        ctx.fillStyle = '#555555';
        ctx.fillText(item.label, x + 16, 11);
        x += ctx.measureText(item.label).width + 32;
    });
}

function updateBandwidthChart(bw) {
    bandwidthHistory.push({
        up: bw.bytes_sent_rate,
        down: bw.bytes_recv_rate,
    });
    if (bandwidthHistory.length > 60) bandwidthHistory.shift();

    if (!bwCtx) return;
    const canvas = document.getElementById('bandwidth-chart');
    const w = canvas.width;
    const h = canvas.height;

    bwCtx.clearRect(0, 0, w, h);
    drawGrid(bwCtx, w, h, 4);

    const maxVal = Math.max(
        ...bandwidthHistory.map(d => d.up),
        ...bandwidthHistory.map(d => d.down),
        1024
    );

    drawLabels(bwCtx, w, h, maxVal, 4);

    const chartLeft = 50;
    const chartW = w - chartLeft - 10;
    const step = chartW / (bandwidthHistory.length - 1 || 1);

    // Download line (solid)
    bwCtx.beginPath();
    bwCtx.strokeStyle = '#111111';
    bwCtx.lineWidth = 2;
    bandwidthHistory.forEach((d, i) => {
        const x = chartLeft + i * step;
        const y = h - (d.down / maxVal) * (h - 30) - 10;
        i === 0 ? bwCtx.moveTo(x, y) : bwCtx.lineTo(x, y);
    });
    bwCtx.stroke();

    // Upload line (dashed)
    bwCtx.beginPath();
    bwCtx.strokeStyle = '#888888';
    bwCtx.lineWidth = 1.5;
    bwCtx.setLineDash([5, 5]);
    bandwidthHistory.forEach((d, i) => {
        const x = chartLeft + i * step;
        const y = h - (d.up / maxVal) * (h - 30) - 10;
        i === 0 ? bwCtx.moveTo(x, y) : bwCtx.lineTo(x, y);
    });
    bwCtx.stroke();
    bwCtx.setLineDash([]);

    drawLegend(bwCtx, [
        { color: '#111111', label: 'download' },
        { color: '#888888', label: 'upload' }
    ]);
}

function updateErrorsChart(bw) {
    errorsHistory.push({
        errors: bw.errin + bw.errout,
        drops: bw.dropin + bw.dropout
    });
    if (errorsHistory.length > 60) errorsHistory.shift();

    if (!errCtx) return;
    const canvas = document.getElementById('errors-chart');
    const w = canvas.width;
    const h = canvas.height;

    errCtx.clearRect(0, 0, w, h);
    drawGrid(errCtx, w, h, 4);

    const maxVal = Math.max(
        ...errorsHistory.map(d => d.errors),
        ...errorsHistory.map(d => d.drops),
        10
    );

    drawLabels(errCtx, w, h, maxVal, 4);

    const chartLeft = 50;
    const chartW = w - chartLeft - 10;
    const step = chartW / (errorsHistory.length - 1 || 1);
    const barW = Math.max(step * 0.6, 2);

    // Errors bars
    errCtx.fillStyle = '#b22222';
    errorsHistory.forEach((d, i) => {
        const x = chartLeft + i * step;
        const barH = (d.errors / maxVal) * (h - 30);
        if (barH > 0) {
            errCtx.fillRect(x - barW/2, h - barH - 10, barW, barH);
        }
    });

    // Drops bars
    errCtx.fillStyle = '#a07000';
    errorsHistory.forEach((d, i) => {
        const x = chartLeft + i * step + barW * 0.4;
        const barH = (d.drops / maxVal) * (h - 30);
        if (barH > 0) {
            errCtx.fillRect(x - barW/2, h - barH - 10, barW * 0.8, barH);
        }
    });

    drawLegend(errCtx, [
        { color: '#b22222', label: 'errors' },
        { color: '#a07000', label: 'drops' }
    ]);
}

function updatePacketsChart(bw) {
    packetsHistory.push({
        sent: bw.packets_sent,
        recv: bw.packets_recv
    });
    if (packetsHistory.length > 2) packetsHistory.shift();

    if (packetsHistory.length < 2 || !pktCtx) return;

    const canvas = document.getElementById('packets-chart');
    const w = canvas.width;
    const h = canvas.height;

    pktCtx.clearRect(0, 0, w, h);
    drawGrid(pktCtx, w, h, 4);

    const prev = packetsHistory[0];
    const curr = packetsHistory[1];
    const deltaSent = curr.sent - prev.sent;
    const deltaRecv = curr.recv - prev.recv;

    const maxVal = Math.max(deltaSent, deltaRecv, 100);

    const chartLeft = 50;
    const barWidth = (w - chartLeft - 20) / 4;
    const barGap = 20;

    // Bars
    const bars = [
        { label: 'pkt_sent', value: deltaSent, color: '#555555' },
        { label: 'pkt_recv', value: deltaRecv, color: '#111111' }
    ];

    bars.forEach((bar, i) => {
        const x = chartLeft + i * (barWidth + barGap);
        const barH = (bar.value / maxVal) * (h - 40);

        pktCtx.fillStyle = bar.color;
        pktCtx.fillRect(x, h - barH - 20, barWidth, barH);

        pktCtx.font = '10px IBM Plex Mono, Courier New, monospace';
        pktCtx.fillStyle = '#555555';
        pktCtx.textAlign = 'center';
        pktCtx.fillText(bar.label, x + barWidth/2, h - 6);
        pktCtx.fillText(formatNumber(bar.value), x + barWidth/2, h - barH - 26);
    });

    pktCtx.textAlign = 'left';
}

function updateInterfaceChart(interfaces) {
    if (!ifaceCtx) return;

    const canvas = document.getElementById('interface-chart');
    const w = canvas.width;
    const h = canvas.height;

    ifaceCtx.clearRect(0, 0, w, h);

    const active = interfaces.filter(i => i.is_up);
    if (active.length === 0) {
        ifaceCtx.font = '12px IBM Plex Mono, Courier New, monospace';
        ifaceCtx.fillStyle = '#888888';
        ifaceCtx.fillText('no active interfaces', 20, h/2);
        return;
    }

    const maxBytes = Math.max(...active.map(i => Math.max(i.bytes_sent, i.bytes_recv)), 1024);

    const chartLeft = 10;
    const chartW = w - chartLeft - 10;
    const barHeight = Math.min(24, (h - 20) / active.length - 8);
    const barGap = 8;

    active.forEach((iface, i) => {
        const y = 20 + i * (barHeight * 2 + barGap);
        if (y + barHeight * 2 > h) return;

        // Label
        ifaceCtx.font = '9px IBM Plex Mono, Courier New, monospace';
        ifaceCtx.fillStyle = '#555555';
        ifaceCtx.fillText(iface.name.substring(0, 15), chartLeft, y + 2);

        // Sent bar
        const sentW = (iface.bytes_sent / maxBytes) * chartW;
        ifaceCtx.fillStyle = '#555555';
        ifaceCtx.fillRect(chartLeft, y + 6, Math.max(sentW, 2), barHeight);

        // Recv bar
        const recvW = (iface.bytes_recv / maxBytes) * chartW;
        ifaceCtx.fillStyle = '#111111';
        ifaceCtx.fillRect(chartLeft, y + 6 + barHeight + 2, Math.max(recvW, 2), barHeight);

        // Values
        ifaceCtx.font = '8px IBM Plex Mono, Courier New, monospace';
        ifaceCtx.fillStyle = '#888888';
        ifaceCtx.fillText('s:' + formatBytesShort(iface.bytes_sent), chartLeft + Math.max(sentW, 2) + 4, y + 6 + barHeight - 2);
        ifaceCtx.fillText('r:' + formatBytesShort(iface.bytes_recv), chartLeft + Math.max(recvW, 2) + 4, y + 6 + barHeight * 2);
    });
}

function updateConnectionStatusChart() {
    // Fetch connections and count statuses
    fetch(API + '/api/connections')
        .then(r => r.json())
        .then(data => {
            const counts = {};
            data.forEach(c => {
                counts[c.status] = (counts[c.status] || 0) + 1;
            });
            drawConnectionPie(counts);
        })
        .catch(() => {});
}

function drawConnectionPie(counts) {
    if (!connCtx) return;

    const canvas = document.getElementById('connection-status-chart');
    const w = canvas.width;
    const h = canvas.height;

    connCtx.clearRect(0, 0, w, h);

    const entries = Object.entries(counts);
    if (entries.length === 0) {
        connCtx.font = '12px IBM Plex Mono, Courier New, monospace';
        connCtx.fillStyle = '#888888';
        connCtx.fillText('no connections', 20, h/2);
        return;
    }

    const total = entries.reduce((sum, e) => sum + e[1], 0);
    const cx = 70;
    const cy = h / 2;
    const r = 50;

    const colors = {
        'ESTABLISHED': '#111111',
        'LISTEN': '#555555',
        'TIME_WAIT': '#a07000',
        'CLOSE_WAIT': '#b22222',
        'SYN_SENT': '#777777',
        'SYN_RECEIVED': '#999999',
        'FIN_WAIT_1': '#bbbbbb',
        'FIN_WAIT_2': '#cccccc',
        'CLOSING': '#888888',
        'LAST_ACK': '#666666',
        'UNKNOWN': '#aaaaaa'
    };

    let startAngle = -Math.PI / 2;
    entries.forEach(([status, count]) => {
        const sliceAngle = (count / total) * Math.PI * 2;
        const color = colors[status] || '#cccccc';

        connCtx.beginPath();
        connCtx.moveTo(cx, cy);
        connCtx.arc(cx, cy, r, startAngle, startAngle + sliceAngle);
        connCtx.closePath();
        connCtx.fillStyle = color;
        connCtx.fill();
        connCtx.strokeStyle = '#ffffff';
        connCtx.lineWidth = 2;
        connCtx.stroke();

        startAngle += sliceAngle;
    });

    // Legend on the right
    const legendX = 140;
    let legendY = 20;
    connCtx.font = '10px IBM Plex Mono, Courier New, monospace';
    entries.forEach(([status, count]) => {
        const color = colors[status] || '#cccccc';
        connCtx.fillStyle = color;
        connCtx.fillRect(legendX, legendY, 10, 10);
        connCtx.fillStyle = '#111111';
        connCtx.fillText(status.toLowerCase() + ' (' + count + ')', legendX + 16, legendY + 9);
        legendY += 18;
    });
}

// ========== INTERFACES TAB ==========

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

// ========== CONNECTIONS TAB ==========

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

// ========== PING ==========

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
                resultDiv.innerHTML = `> ${data.host} is up <span style="color:var(--green);font-weight:600">[ok]</span> // ${data.latency}ms`;
            } else {
                resultDiv.innerHTML = `> ${data.host} is down <span style="color:var(--red);font-weight:600">[fail]</span>`;
            }
        } catch (e) {
            resultDiv.innerHTML = `> error: ${e.message}`;
        }
        btn.disabled = false;
    });
}

// ========== SCANNER ==========

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

// ========== UTILS ==========

function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function formatBytesShort(bytes) {
    if (bytes === 0) return '0';
    const k = 1024;
    const sizes = ['B', 'K', 'M', 'G', 'T'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + sizes[i];
}

function formatNumber(n) {
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
    return n.toString();
}
