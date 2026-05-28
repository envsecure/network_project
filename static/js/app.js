const API = '';
let bandwidthHistory = [];
let errorsHistory = [];
let packetsHistory = [];
let refreshInterval = null;

let bwCtx, errCtx, pktCtx, ifaceCtx, connCtx, ifaceCompareCtx;

document.addEventListener('DOMContentLoaded', () => {
    initTabs();
    loadDashboard();
    startAutoRefresh();
    initPing();
    initScanner();
    window.addEventListener('resize', () => {
        initCharts();
        loadDashboard();
    });
    setTimeout(initCharts, 100);
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
            setTimeout(initCharts, 50);
        });
    });
}

function initCharts() {
    bwCtx = setupCanvas('bandwidth-chart', 220);
    errCtx = setupCanvas('errors-chart', 220);
    pktCtx = setupCanvas('packets-chart', 220);
    ifaceCtx = setupCanvas('interface-chart', 220);
    connCtx = setupCanvas('connection-status-chart', 280);
    ifaceCompareCtx = setupCanvas('iface-compare-chart', 260);
}

function setupCanvas(id, height) {
    const canvas = document.getElementById(id);
    if (!canvas) return null;
    const rect = canvas.parentElement.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = (rect.width - 36) * dpr;
    canvas.height = height * dpr;
    canvas.style.width = (rect.width - 36) + 'px';
    canvas.style.height = height + 'px';
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    return ctx;
}

function startAutoRefresh() {
    refreshInterval = setInterval(loadDashboard, 2000);
}

async function loadDashboard() {
    try {
        const [summary, listening, interfaces] = await Promise.all([
            fetch(API + '/api/summary').then(r => r.json()),
            fetch(API + '/api/listening').then(r => r.json()),
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
        updateIfaceCompareChart(interfaces);
    } catch (e) {
        console.error('Dashboard refresh error:', e);
    }
}

function updateHealth(health) {
    const score = health.score;
    document.getElementById('score-text').textContent = score;
    const offset = 339.292 - (339.292 * score / 100);
    document.getElementById('score-fill').style.strokeDashoffset = offset;

    let color = 'var(--green)';
    if (score < 40) color = 'var(--red)';
    else if (score < 60) color = 'var(--yellow)';
    document.getElementById('score-fill').style.stroke = color;

    document.getElementById('health-status').textContent = health.status;
    document.getElementById('health-issues').textContent = health.issues.length > 0 ? health.issues.join(' // ') : 'no issues detected';
    document.getElementById('gateway-display').textContent = 'gw: ' + (health.gateway || 'none');
    document.getElementById('dns-display').textContent = 'dns: ' + (health.dns_servers.length > 0 ? health.dns_servers[0] : 'none');
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
    document.getElementById('listening-tbody').innerHTML = ports.map(p =>
        `<tr><td>${p.port}</td><td>${p.address}</td><td>${p.process}</td><td>${p.pid || '-'}</td></tr>`
    ).join('');
}

function updateListeningPortsSmall(ports) {
    document.getElementById('listening-tbody-small').innerHTML = ports.slice(0, 8).map(p =>
        `<tr><td>${p.port}</td><td>${p.process}</td><td>${p.pid || '-'}</td></tr>`
    ).join('');
}

// ==================== CHART HELPERS ====================

const FONT = '14px IBM Plex Mono, Courier New, monospace';
const FONT_SM = '12px IBM Plex Mono, Courier New, monospace';
const FONT_LG = 'bold 14px IBM Plex Mono, Courier New, monospace';
const COL_TEXT = '#000000';
const COL_MUTED = '#333333';
const COL_LIGHT = '#777777';
const COL_GRID = '#dddddd';

function getCanvasSize(id) {
    const canvas = document.getElementById(id);
    if (!canvas) return { w: 0, h: 0 };
    return { w: canvas.width / (window.devicePixelRatio || 1), h: canvas.height / (window.devicePixelRatio || 1) };
}

function drawGrid(ctx, w, h, rows, topPad, bottomPad) {
    topPad = topPad || 30;
    bottomPad = bottomPad || 30;
    ctx.strokeStyle = COL_GRID;
    ctx.lineWidth = 1;
    for (let i = 0; i <= rows; i++) {
        const y = topPad + ((h - topPad - bottomPad) / rows) * i;
        ctx.beginPath();
        ctx.moveTo(50, y);
        ctx.lineTo(w - 10, y);
        ctx.stroke();
    }
}

function drawYLabels(ctx, h, maxVal, rows, topPad, bottomPad, formatter) {
    topPad = topPad || 30;
    bottomPad = bottomPad || 30;
    formatter = formatter || formatBytesShort;
    ctx.font = FONT_SM;
    ctx.fillStyle = COL_MUTED;
    ctx.textAlign = 'right';
    for (let i = 0; i <= rows; i++) {
        const y = topPad + ((h - topPad - bottomPad) / rows) * i;
        const val = maxVal - (maxVal / rows) * i;
        ctx.fillText(formatter(val), 46, y + 4);
    }
    ctx.textAlign = 'left';
}

function drawLegend(ctx, items, x, y) {
    x = x || 55;
    y = y || 16;
    ctx.font = FONT_SM;
    let cx = x;
    items.forEach(item => {
        ctx.fillStyle = item.color;
        ctx.fillRect(cx, y - 6, 14, 4);
        ctx.fillStyle = COL_MUTED;
        ctx.fillText(item.label, cx + 18, y);
        cx += ctx.measureText(item.label).width + 40;
    });
}

// ==================== BANDWIDTH CHART ====================

function updateBandwidthChart(bw) {
    bandwidthHistory.push({ up: bw.bytes_sent_rate, down: bw.bytes_recv_rate });
    if (bandwidthHistory.length > 60) bandwidthHistory.shift();

    const { w, h } = getCanvasSize('bandwidth-chart');
    if (!bwCtx || w === 0) return;

    bwCtx.clearRect(0, 0, w, h);
    const top = 35, bot = 10;
    drawGrid(bwCtx, w, h, 5, top, bot);

    const maxVal = Math.max(...bandwidthHistory.map(d => d.up), ...bandwidthHistory.map(d => d.down), 1024);
    drawYLabels(bwCtx, h, maxVal, 5, top, bot);

    const left = 55;
    const cw = w - left - 10;
    const step = cw / (bandwidthHistory.length - 1 || 1);

    // Download fill
    bwCtx.beginPath();
    bwCtx.fillStyle = 'rgba(0, 90, 200, 0.08)';
    bandwidthHistory.forEach((d, i) => {
        const x = left + i * step;
        const y = h - bot - (d.down / maxVal) * (h - top - bot);
        i === 0 ? bwCtx.moveTo(x, y) : bwCtx.lineTo(x, y);
    });
    bwCtx.lineTo(left + (bandwidthHistory.length - 1) * step, h - bot);
    bwCtx.lineTo(left, h - bot);
    bwCtx.fill();

    // Download line
    bwCtx.beginPath();
    bwCtx.strokeStyle = '#0055cc';
    bwCtx.lineWidth = 2.5;
    bandwidthHistory.forEach((d, i) => {
        const x = left + i * step;
        const y = h - bot - (d.down / maxVal) * (h - top - bot);
        i === 0 ? bwCtx.moveTo(x, y) : bwCtx.lineTo(x, y);
    });
    bwCtx.stroke();

    // Upload line
    bwCtx.beginPath();
    bwCtx.strokeStyle = '#1a8a3a';
    bwCtx.lineWidth = 2;
    bwCtx.setLineDash([6, 4]);
    bandwidthHistory.forEach((d, i) => {
        const x = left + i * step;
        const y = h - bot - (d.up / maxVal) * (h - top - bot);
        i === 0 ? bwCtx.moveTo(x, y) : bwCtx.lineTo(x, y);
    });
    bwCtx.stroke();
    bwCtx.setLineDash([]);

    drawLegend(bwCtx, [
        { color: '#0055cc', label: 'download' },
        { color: '#1a8a3a', label: 'upload' }
    ]);
}

// ==================== ERRORS CHART ====================

function updateErrorsChart(bw) {
    errorsHistory.push({ errors: bw.errin + bw.errout, drops: bw.dropin + bw.dropout });
    if (errorsHistory.length > 60) errorsHistory.shift();

    const { w, h } = getCanvasSize('errors-chart');
    if (!errCtx || w === 0) return;

    errCtx.clearRect(0, 0, w, h);
    const top = 35, bot = 10;
    drawGrid(errCtx, w, h, 5, top, bot);

    const maxVal = Math.max(...errorsHistory.map(d => d.errors), ...errorsHistory.map(d => d.drops), 10);
    drawYLabels(errCtx, h, maxVal, 5, top, bot);

    const left = 55;
    const cw = w - left - 10;
    const step = cw / (errorsHistory.length || 1);
    const barW = Math.max(step * 0.5, 3);

    errorsHistory.forEach((d, i) => {
        const x = left + i * step + step * 0.15;
        const eH = (d.errors / maxVal) * (h - top - bot);
        const dH = (d.drops / maxVal) * (h - top - bot);

        if (eH > 0) {
            errCtx.fillStyle = '#991111';
            errCtx.fillRect(x, h - bot - eH, barW, eH);
        }
        if (dH > 0) {
            errCtx.fillStyle = '#8a5e00';
            errCtx.fillRect(x + barW + 2, h - bot - dH, barW, dH);
        }
    });

    drawLegend(errCtx, [
        { color: '#991111', label: 'errors' },
        { color: '#8a5e00', label: 'drops' }
    ]);
}

// ==================== PACKETS CHART ====================

function updatePacketsChart(bw) {
    packetsHistory.push({ sent: bw.packets_sent, recv: bw.packets_recv });
    if (packetsHistory.length > 2) packetsHistory.shift();

    const { w, h } = getCanvasSize('packets-chart');
    if (packetsHistory.length < 2 || !pktCtx || w === 0) return;

    pktCtx.clearRect(0, 0, w, h);
    const top = 35, bot = 35;

    const prev = packetsHistory[0];
    const curr = packetsHistory[1];
    const deltaSent = curr.sent - prev.sent;
    const deltaRecv = curr.recv - prev.recv;
    const maxVal = Math.max(deltaSent, deltaRecv, 100);

    drawGrid(pktCtx, w, h, 5, top, bot);
    drawYLabels(pktCtx, h, maxVal, 5, top, bot, formatNumber);

    const left = 55;
    const barWidth = (w - left - 30) / 3;

    const bars = [
        { label: 'pkt_sent', value: deltaSent, color: '#333333' },
        { label: 'pkt_recv', value: deltaRecv, color: '#000000' }
    ];

    bars.forEach((bar, i) => {
        const x = left + i * (barWidth + 16);
        const barH = (bar.value / maxVal) * (h - top - bot);

        pktCtx.fillStyle = bar.color;
        pktCtx.fillRect(x, h - bot - barH, barWidth, barH);

        pktCtx.font = FONT_SM;
        pktCtx.fillStyle = COL_MUTED;
        pktCtx.textAlign = 'center';
        pktCtx.fillText(bar.label, x + barWidth / 2, h - 12);
        pktCtx.font = FONT_LG;
        pktCtx.fillStyle = COL_TEXT;
        pktCtx.fillText(formatNumber(bar.value), x + barWidth / 2, h - bot - barH - 8);
    });
    pktCtx.textAlign = 'left';
}

// ==================== INTERFACE CHART ====================

function updateInterfaceChart(interfaces) {
    const { w, h } = getCanvasSize('interface-chart');
    if (!ifaceCtx || w === 0) return;

    ifaceCtx.clearRect(0, 0, w, h);
    const active = interfaces.filter(i => i.is_up);

    if (active.length === 0) {
        ifaceCtx.font = FONT;
        ifaceCtx.fillStyle = COL_LIGHT;
        ifaceCtx.fillText('no active interfaces', 60, h / 2);
        return;
    }

    const maxBytes = Math.max(...active.map(i => Math.max(i.bytes_sent, i.bytes_recv)), 1024);
    const barH = Math.min(28, (h - 40) / active.length - 10);
    const gap = 10;

    active.forEach((iface, i) => {
        const y = 20 + i * (barH * 2 + gap + 16);
        if (y + barH * 2 + 16 > h) return;

        ifaceCtx.font = FONT_SM;
        ifaceCtx.fillStyle = COL_MUTED;
        ifaceCtx.fillText(iface.name, 10, y);

        const maxW = w - 140;
        const sentW = (iface.bytes_sent / maxBytes) * maxW;
        const recvW = (iface.bytes_recv / maxBytes) * maxW;

        ifaceCtx.fillStyle = '#555555';
        ifaceCtx.fillRect(10, y + 6, Math.max(sentW, 3), barH);

        ifaceCtx.fillStyle = '#000000';
        ifaceCtx.fillRect(10, y + 6 + barH + 2, Math.max(recvW, 3), barH);

        ifaceCtx.font = FONT_SM;
        ifaceCtx.fillStyle = COL_MUTED;
        const sx = 14 + Math.max(sentW, 3);
        const rx = 14 + Math.max(recvW, 3);
        if (sx + 80 < w) ifaceCtx.fillText('s:' + formatBytesShort(iface.bytes_sent), sx, y + 6 + barH - 3);
        if (rx + 80 < w) ifaceCtx.fillText('r:' + formatBytesShort(iface.bytes_recv), rx, y + 6 + barH * 2 + 2);
    });
}

// ==================== CONNECTION PIE ====================

function updateConnectionStatusChart() {
    fetch(API + '/api/connections')
        .then(r => r.json())
        .then(data => {
            const counts = {};
            data.forEach(c => { counts[c.status] = (counts[c.status] || 0) + 1; });
            drawConnectionPie(counts);
        })
        .catch(() => {});
}

function drawConnectionPie(counts) {
    const { w, h } = getCanvasSize('connection-status-chart');
    if (!connCtx || w === 0) return;

    connCtx.clearRect(0, 0, w, h);
    const entries = Object.entries(counts);

    if (entries.length === 0) {
        connCtx.font = FONT;
        connCtx.fillStyle = COL_LIGHT;
        connCtx.fillText('no connections', 60, h / 2);
        return;
    }

    const total = entries.reduce((s, e) => s + e[1], 0);
    const maxR = Math.min(w * 0.35, h * 0.42);
    const r = Math.max(maxR, 50);
    const cx = r + 40;
    const cy = h / 2;

    const colors = {
        'ESTABLISHED': '#0055cc', 'LISTEN': '#1a8a3a', 'TIME_WAIT': '#8a5e00',
        'CLOSE_WAIT': '#991111', 'SYN_SENT': '#555555', 'SYN_RECEIVED': '#777777',
        'FIN_WAIT_1': '#999999', 'FIN_WAIT_2': '#aaaaaa', 'CLOSING': '#666666',
        'LAST_ACK': '#444444', 'UNKNOWN': '#bbbbbb'
    };

    let angle = -Math.PI / 2;
    entries.forEach(([status, count]) => {
        const slice = (count / total) * Math.PI * 2;
        connCtx.beginPath();
        connCtx.moveTo(cx, cy);
        connCtx.arc(cx, cy, r, angle, angle + slice);
        connCtx.closePath();
        connCtx.fillStyle = colors[status] || '#cccccc';
        connCtx.fill();
        connCtx.strokeStyle = '#ffffff';
        connCtx.lineWidth = 3;
        connCtx.stroke();
        angle += slice;
    });

    // Center text
    connCtx.font = 'bold 16px IBM Plex Mono, Courier New, monospace';
    connCtx.fillStyle = COL_TEXT;
    connCtx.textAlign = 'center';
    connCtx.fillText(total, cx, cy - 2);
    connCtx.font = FONT_SM;
    connCtx.fillStyle = COL_MUTED;
    connCtx.fillText('total', cx, cy + 16);
    connCtx.textAlign = 'left';

    const lx = cx + r + 30;
    let ly = 16;
    connCtx.font = FONT_SM;
    entries.forEach(([status, count]) => {
        if (ly > h - 10) return;
        connCtx.fillStyle = colors[status] || '#cccccc';
        connCtx.fillRect(lx, ly - 4, 14, 14);
        connCtx.fillStyle = COL_TEXT;
        connCtx.fillText(status.toLowerCase() + ' (' + count + ')', lx + 20, ly + 8);
        ly += 24;
    });
}

// ==================== INTERFACES TAB ====================

async function loadInterfaces() {
    try {
        const data = await fetch(API + '/api/interfaces').then(r => r.json());
        setTimeout(() => {
            initCharts();
            updateIfaceCompareChart(data);
        }, 100);
        document.getElementById('interfaces-list').innerHTML = data.map(iface => `
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

// ==================== CONNECTIONS TAB ====================

async function loadConnections() {
    try {
        const data = await fetch(API + '/api/connections').then(r => r.json());
        document.getElementById('connections-tbody').innerHTML = data.slice(0, 100).map(c => {
            const sc = c.status === 'ESTABLISHED' ? 'established' : c.status === 'LISTEN' ? 'listen'
                : c.status === 'TIME_WAIT' ? 'time-wait' : c.status === 'CLOSE_WAIT' ? 'close-wait' : 'default';
            return `<tr><td>${c.laddr || '-'}</td><td>${c.raddr || '-'}</td>
                <td><span class="status-badge ${sc}">${c.status.toLowerCase()}</span></td>
                <td>${c.type.includes('SOCK_STREAM') ? 'tcp' : 'udp'}</td><td>${c.pid || '-'}</td></tr>`;
        }).join('');
    } catch (e) {
        console.error('Load connections error:', e);
    }
}

// ==================== INTERFACE COMPARE CHART ====================

function updateIfaceCompareChart(interfaces) {
    const { w, h } = getCanvasSize('iface-compare-chart');
    if (!ifaceCompareCtx || w === 0) return;

    ifaceCompareCtx.clearRect(0, 0, w, h);

    const active = interfaces.filter(i => i.is_up);
    if (active.length === 0) {
        ifaceCompareCtx.font = FONT;
        ifaceCompareCtx.fillStyle = COL_LIGHT;
        ifaceCompareCtx.fillText('no active interfaces', 60, h / 2);
        return;
    }

    const left = 60;
    const top = 30;
    const bot = 40;
    const right = 20;
    const cw = w - left - right;
    const ch = h - top - bot;

    const maxBytes = Math.max(...active.map(i => Math.max(i.bytes_sent, i.bytes_recv)), 1024);

    // Grid
    drawGrid(ifaceCompareCtx, w, h, 5, top, bot);
    drawYLabels(ifaceCompareCtx, h, maxBytes, 5, top, bot);

    const groupW = cw / active.length;
    const barW = Math.min(groupW * 0.3, 40);
    const gap = 6;

    active.forEach((iface, i) => {
        const gx = left + i * groupW + groupW / 2;

        // Sent bar
        const sentH = (iface.bytes_sent / maxBytes) * ch;
        ifaceCompareCtx.fillStyle = '#0055cc';
        ifaceCompareCtx.fillRect(gx - barW - gap / 2, h - bot - sentH, barW, sentH);

        // Recv bar
        const recvH = (iface.bytes_recv / maxBytes) * ch;
        ifaceCompareCtx.fillStyle = '#1a8a3a';
        ifaceCompareCtx.fillRect(gx + gap / 2, h - bot - recvH, barW, recvH);

        // Value labels on top of bars
        ifaceCompareCtx.font = FONT_SM;
        ifaceCompareCtx.textAlign = 'center';
        ifaceCompareCtx.fillStyle = '#0055cc';
        if (sentH > 15) ifaceCompareCtx.fillText(formatBytesShort(iface.bytes_sent), gx - barW / 2 - gap / 2, h - bot - sentH - 6);
        ifaceCompareCtx.fillStyle = '#1a8a3a';
        if (recvH > 15) ifaceCompareCtx.fillText(formatBytesShort(iface.bytes_recv), gx + barW / 2 + gap / 2, h - bot - recvH - 6);

        // Interface name at bottom
        ifaceCompareCtx.fillStyle = COL_MUTED;
        ifaceCompareCtx.font = FONT_SM;
        const name = iface.name.length > 12 ? iface.name.substring(0, 10) + '..' : iface.name;
        ifaceCompareCtx.fillText(name, gx, h - 10);
    });

    ifaceCompareCtx.textAlign = 'left';

    // Legend
    drawLegend(ifaceCompareCtx, [
        { color: '#0055cc', label: 'sent' },
        { color: '#1a8a3a', label: 'recv' }
    ], left, 16);
}

// ==================== PING ====================

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
            resultDiv.innerHTML = data.status === 'up'
                ? `> ${data.host} is up <span style="color:var(--green);font-weight:700">[ok]</span> // ${data.latency}ms`
                : `> ${data.host} is down <span style="color:var(--red);font-weight:700">[fail]</span>`;
        } catch (e) {
            resultDiv.innerHTML = `> error: ${e.message}`;
        }
        btn.disabled = false;
    });
}

// ==================== SCANNER ====================

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
                    document.getElementById('devices-grid').innerHTML = data.devices.map(d => `
                        <div class="device-card">
                            <div class="device-icon">[device]</div>
                            <div class="device-ip">${d.ip}</div>
                            <div class="device-mac">${d.mac}</div>
                            <div class="device-vendor">${d.vendor}</div>
                        </div>
                    `).join('');
                }
            }, 1000);
        } catch (e) {
            btn.disabled = false;
            status.textContent = 'error: ' + e.message;
            status.style.color = 'var(--red)';
        }
    });
}

// ==================== UTILS ====================

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
