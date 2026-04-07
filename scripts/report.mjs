#!/usr/bin/env node
/**
 * iPhone Sysdiagnose Report Generator
 * Generates an Apple HIG-style dark theme HTML report from extracted data.
 * Usage: node report.mjs data.json [-o report.html]
 */

import { readFileSync, writeFileSync } from 'node:fs';

const VERSION = '0.2.5';

// ─── Formatters ─────────────────────────────────────────────────────────────

function fmtDatetime(ts, tzOffsetMinutes) {
  const d = new Date((ts + (tzOffsetMinutes || 0) * 60) * 1000);
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mi = String(d.getUTCMinutes()).padStart(2, '0');
  return `${mm}/${dd} ${hh}:${mi}`;
}

function fmtDatetimeFull(ts, tzOffsetMinutes) {
  const d = new Date((ts + (tzOffsetMinutes || 0) * 60) * 1000);
  const y = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mi = String(d.getUTCMinutes()).padStart(2, '0');
  const ss = String(d.getUTCSeconds()).padStart(2, '0');
  return `${y}-${mm}-${dd} ${hh}:${mi}:${ss}`;
}

function fmtBytes(b) {
  if (!b) return '0 B';
  for (const u of ['B', 'KB', 'MB', 'GB', 'TB']) {
    if (Math.abs(b) < 1024) return `${b.toFixed(1)} ${u}`;
    b /= 1024;
  }
  return `${b.toFixed(1)} PB`;
}

function fmtSeconds(s) {
  if (!s) return '0s';
  s = Math.floor(s);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`;
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  if (h < 24) return `${h}h ${m}m`;
  return `${Math.floor(h / 24)}天 ${h % 24}时`;
}

// ─── App Name Mapping ───────────────────────────────────────────────────────

const APP_NAMES = {
  'com.taobao.fleamarket': '淘宝', 'com.taobao.taobao4iphone': '淘宝',
  'com.ss.iphone.ugc.Aweme': '抖音', 'com.ss.iphone.ugc.Live.lite': '抖音直播',
  'com.tencent.xin': '微信', 'com.xingin.discover': '小红书',
  'com.xunmeng.pinduoduo': '拼多多', 'com.apple.mobilesafari': 'Safari',
  'com.apple.mobilemail': '邮件', 'com.apple.mobilephone': '电话',
  'com.apple.MobileSMS': '短信', 'com.apple.mobileslideshow': '照片',
  'com.apple.Music': '音乐', 'com.apple.podcasts': '播客',
  'com.apple.Maps': '地图', 'com.apple.weather': '天气',
  'com.apple.mobilecal': '日历', 'com.apple.reminders': '提醒事项',
  'com.apple.mobilenotes': '备忘录', 'com.apple.AppStore': 'App Store',
  'com.apple.Preferences': '设置', 'com.apple.camera': '相机',
  'com.apple.mobiletimer': '时钟', 'com.apple.Health': '健康',
  'com.apple.Fitness': '健身', 'com.burbn.instagram': 'Instagram',
  'com.google.chrome.ios': 'Chrome', 'com.spotify.client': 'Spotify',
  'com.netease.mail': '网易邮箱', 'com.netease.cloudmusic': '网易云音乐',
  'com.gotokeep.keep': 'Keep', 'com.alipay.iphoneclient': '支付宝',
  'com.meituan.takeoutnew': '美团', 'com.sina.weibo': '微博',
  'com.zhihu.ios': '知乎', 'tv.danmaku.bili': 'B站',
  'searchd': '搜索', 'healthd': '健康守护', 'thermalmonitord': '温度监控',
  'backboardd': '系统UI', 'mediaserverd': '媒体服务',
  'locationd': '定位服务', 'wifid': 'WiFi', 'bluetoothd': '蓝牙',
};

function shortName(bundleId) {
  if (!bundleId) return '未知';
  if (APP_NAMES[bundleId]) return APP_NAMES[bundleId];
  const parts = bundleId.split('.');
  return parts[parts.length - 1].slice(0, 16);
}

// ─── Language Detection ─────────────────────────────────────────────────────

function detectLanguage(data, tzOffsetMinutes) {
  const bundles = new Set();
  const extractItems = d => (d?.items || d || []);
  for (const key of ['app_screen_time', 'app_nand_writers', 'app_memory', 'app_energy', 'app_cpu']) {
    for (const item of extractItems(data[key])) {
      const bid = item.bundle_id || item.name;
      if (bid) bundles.add(bid);
    }
  }
  const cnPrefixes = ['com.taobao', 'com.tencent', 'com.ss.iphone', 'com.xingin',
    'com.xunmeng', 'com.alipay', 'com.sina', 'com.netease',
    'com.zhihu', 'com.duowan', 'tv.danmaku', 'com.gotokeep', 'com.bilibili', 'com.meituan'];
  for (const b of bundles) {
    for (const p of cnPrefixes) { if (b.startsWith(p)) return 'zh'; }
  }
  // Fallback: timezone hint (UTC+5 to UTC+9 covers China/Japan/Korea)
  if (tzOffsetMinutes >= 300 && tzOffsetMinutes <= 540) return 'zh';
  return 'en';
}

// ─── Health Color ───────────────────────────────────────────────────────────

function healthColor(pct) {
  if (pct == null) return '#636366';
  if (pct >= 90) return '#34c759';
  if (pct >= 80) return '#ff9f0a';
  return '#ff3b30';
}

function rangeLabel(minTs, maxTs, tzMin, isCn) {
  if (!minTs || !maxTs) return '';
  const days = Math.round((maxTs - minTs) / 86400);
  if (days <= 0) return isCn ? '近24小时' : 'last 24h';
  const start = fmtDatetime(minTs, tzMin).split(' ')[0];
  const end = fmtDatetime(maxTs, tzMin).split(' ')[0];
  return `${start}~${end}`;
}

// ─── SVG Chart ──────────────────────────────────────────────────────────────

function interactiveChartSvg(points, valueKey, opts = {}) {
  const { width = 1000, height = 200, color = '#34c759', unit = '%',
    yMax = null, warnLine = null, chartId = 'chart', tzOffsetMinutes = 0 } = opts;

  if (points.length < 2) return '<div class="chart-empty">数据不足</div>';

  const pl = 52, pr = 20, pt = 16, pb = 42;
  const cw = width - pl - pr, ch = height - pt - pb;
  const t0 = points[0].ts, t1 = points[points.length - 1].ts;
  const tr = t1 - t0 || 1;
  const values = points.map(p => p[valueKey] || 0);
  const maxVal = yMax ?? Math.max(...values, 1);

  const tx = ts => pl + (ts - t0) / tr * cw;
  const ty = val => pt + ch - val / maxVal * ch;

  // Line path
  const pathParts = points.map((p, i) =>
    `${i === 0 ? 'M' : 'L'}${tx(p.ts).toFixed(1)},${ty(p[valueKey] || 0).toFixed(1)}`
  );
  const path = pathParts.join(' ');
  const fillPath = `${path} L${tx(points[points.length - 1].ts).toFixed(1)},${pt + ch} L${tx(t0).toFixed(1)},${pt + ch} Z`;

  // Grid lines
  let timeSvg = '';
  for (let i = 0; i < 7; i++) {
    const f = i / 6, x = pl + f * cw, ts = t0 + f * tr;
    timeSvg += `<text x="${x.toFixed(0)}" y="${pt + ch + 18}" text-anchor="middle" class="axis-label">${fmtDatetime(ts, tzOffsetMinutes)}</text>`;
    timeSvg += `<line x1="${x.toFixed(0)}" y1="${pt}" x2="${x.toFixed(0)}" y2="${pt + ch}" class="grid-line"/>`;
  }

  let ySvg = '';
  for (let i = 0; i < 5; i++) {
    const val = i / 4 * maxVal, y = ty(val);
    ySvg += `<text x="${pl - 8}" y="${y + 4}" text-anchor="end" class="axis-label">${val.toFixed(0)}${unit}</text>`;
    if (i > 0) ySvg += `<line x1="${pl}" y1="${y.toFixed(1)}" x2="${pl + cw}" y2="${y.toFixed(1)}" class="grid-line"/>`;
  }

  // Warning line
  let warnSvg = '';
  if (warnLine != null) {
    const wy = ty(warnLine);
    warnSvg = `<line x1="${pl}" y1="${wy.toFixed(1)}" x2="${pl + cw}" y2="${wy.toFixed(1)}" stroke="#ff3b30" stroke-width="1" stroke-dasharray="6,3" opacity=".5"/><text x="${pl + cw - 4}" y="${wy - 6}" fill="#ff3b30" font-size="11" text-anchor="end" font-weight="600">${Math.round(warnLine)}${unit}</text>`;
  }

  // Hover points
  const hover = points.map(p => {
    const x = tx(p.ts), y = ty(p[valueKey] || 0);
    const val = (p[valueKey] || 0).toFixed(1);
    const tsStr = fmtDatetimeFull(p.ts, tzOffsetMinutes);
    return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="8" fill="transparent" class="hover-point" data-val="${val}" data-time="${tsStr}" data-unit="${unit}"/>`;
  }).join('');

  return `<svg viewBox="0 0 ${width} ${height}" style="width:100%;height:${height}px" xmlns="http://www.w3.org/2000/svg" class="chart-svg" id="${chartId}">
<defs><linearGradient id="g_${chartId}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${color}" stop-opacity=".12"/><stop offset="100%" stop-color="${color}" stop-opacity="0"/></linearGradient></defs>
${timeSvg}${ySvg}
<line x1="${pl}" y1="${pt}" x2="${pl}" y2="${pt + ch}" stroke="#3a3a3c" stroke-width="1"/>
<line x1="${pl}" y1="${pt + ch}" x2="${pl + cw}" y2="${pt + ch}" stroke="#3a3a3c" stroke-width="1"/>
<path d="${fillPath}" fill="url(#g_${chartId})"/>
<path d="${path}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
${warnSvg}${hover}
<g id="tt_${chartId}" class="chart-tooltip" visibility="hidden" pointer-events="none">
<line id="ttl_${chartId}" x1="0" y1="${pt}" x2="0" y2="${pt + ch}" stroke="#8e8e93" stroke-width="1" stroke-dasharray="3"/>
<rect id="ttb_${chartId}" x="0" y="0" width="140" height="40" rx="10" fill="#2c2c2e" stroke="#48484a"/>
<text id="ttv_${chartId}" x="0" y="0" fill="#fff" font-size="15" font-weight="700" text-anchor="middle"></text>
<text id="ttt_${chartId}" x="0" y="0" fill="#8e8e93" font-size="11" text-anchor="middle"></text>
</g></svg>`;
}

// ─── CSS ────────────────────────────────────────────────────────────────────

const CSS = `\
:root{--bg:#000;--card:#1c1c1e;--border:#2c2c2e;--green:#34c759;--yellow:#ff9f0a;--red:#ff3b30;--orange:#ff6723;--blue:#0a84ff;--text:#f5f5f7;--sec:#98989d;--ter:#636366}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'SF Pro Display','SF Pro Text','Helvetica Neue',system-ui,sans-serif;background:var(--bg);color:var(--text);font-size:16px;line-height:1.5;-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;text-rendering:optimizeLegibility}
.hero{padding:48px 24px 28px;text-align:center;background:linear-gradient(180deg,#0a0a1a 0%,var(--bg) 100%)}
.hero h1{font-size:2em;font-weight:700;letter-spacing:-.02em}
.hero .sub{color:var(--sec);font-size:.88em;margin-top:6px}
.hero .meta{color:var(--ter);font-size:.8em;margin-top:10px;line-height:1.6}
.device-strip{display:flex;justify-content:center;gap:24px;margin-top:16px;flex-wrap:wrap}
.device-strip .item{text-align:center}
.device-strip .val{font-size:.95em;font-weight:600}
.device-strip .lbl{font-size:.7em;color:var(--sec);text-transform:uppercase;letter-spacing:.6px;margin-top:2px}
.wrap{max-width:1080px;margin:0 auto;padding:0 16px 48px}
.kpi-row{display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin-bottom:14px}
.kpi{background:var(--card);border:1px solid var(--border);border-radius:14px;padding:18px 12px;text-align:center}
.kpi .val{font-size:1.8em;font-weight:700;letter-spacing:-.02em;line-height:1.1}
.kpi .lbl{font-size:.72em;color:var(--sec);text-transform:uppercase;letter-spacing:.5px;margin-top:6px;line-height:1.2}
.card-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:10px}
.card{background:var(--card);border:1px solid var(--border);border-radius:14px;padding:20px;overflow:hidden;display:flex;flex-direction:column}
.card.full{grid-column:1/-1}
.card-title{font-size:.75em;text-transform:uppercase;letter-spacing:.7px;color:var(--sec);margin-bottom:10px;font-weight:600}
.stat-big{font-size:1.9em;font-weight:700;letter-spacing:-.02em;line-height:1}
.stat-sub{font-size:.82em;color:var(--sec);margin-top:5px}
.stat-row{display:flex;justify-content:space-between;align-items:center;padding:7px 0;font-size:.88em;border-bottom:1px solid rgba(255,255,255,.03)}
.stat-row:last-child{border-bottom:none}
.stat-row .k{color:var(--sec);display:flex;align-items:center;gap:4px}
.stat-row .v{font-weight:600}
.bar{height:5px;background:rgba(255,255,255,.05);border-radius:3px;margin:8px 0;overflow:hidden}
.bar>div{height:100%;border-radius:3px}
table{width:100%;border-collapse:collapse;font-size:.88em}
th{text-align:left;font-size:.7em;color:var(--ter);text-transform:uppercase;letter-spacing:.5px;padding:5px 6px;border-bottom:1px solid var(--border);font-weight:600}
td{padding:7px 6px;border-bottom:1px solid rgba(255,255,255,.02)}
tr:last-child td{border-bottom:none}
.tip{cursor:help;color:var(--ter);font-size:.82em;margin-left:3px;display:inline-flex;align-items:center;justify-content:center;width:16px;height:16px;border-radius:50%;border:1px solid var(--ter);font-style:normal;font-weight:600;line-height:1}
.tip-popup{position:fixed;background:#2c2c2e;color:var(--text);padding:10px 14px;border-radius:10px;font-size:.82em;line-height:1.5;max-width:260px;z-index:1000;border:1px solid #48484a;box-shadow:0 8px 24px rgba(0,0,0,.5);pointer-events:none}
.chart-svg{cursor:crosshair;display:block}
.chart-svg .axis-label{font-size:12px;fill:#636366;font-family:-apple-system,sans-serif}
.chart-svg .grid-line{stroke:#2c2c2e;stroke-width:.5}
.chart-svg .hover-point{cursor:pointer}
.chart-tooltip rect{filter:drop-shadow(0 2px 8px rgba(0,0,0,.4))}
.chart-empty{height:100px;display:flex;align-items:center;justify-content:center;color:var(--ter);font-size:.88em}
.footer{text-align:center;padding:32px 0;color:var(--ter);font-size:.78em;border-top:1px solid var(--border);margin-top:24px}
@media(max-width:768px){.card-grid{grid-template-columns:1fr}.kpi-row{grid-template-columns:repeat(3,1fr)}.device-strip{gap:12px}.hero{padding:32px 16px 20px}.hero h1{font-size:1.5em}.kpi .val{font-size:1.3em}.stat-big{font-size:1.5em}}
@media(max-width:480px){.kpi-row{grid-template-columns:repeat(2,1fr)}.device-strip{gap:8px}}`;

// ─── JS ─────────────────────────────────────────────────────────────────────

const CHART_JS = `(function(){
var _popup=null;
function showTip(el,text){if(!_popup){_popup=document.createElement('div');_popup.className='tip-popup';document.body.appendChild(_popup)}_popup.textContent=text;_popup.style.display='block';var r=el.getBoundingClientRect();_popup.style.left=Math.max(8,Math.min(window.innerWidth-280,r.left+r.width/2-130))+'px';_popup.style.top=(r.top-8)+'px';_popup.style.transform='translateY(-100%)'}
function hideTip(){if(_popup)_popup.style.display='none'}
document.querySelectorAll('.tip').forEach(function(el){var text=el.getAttribute('data-tip');el.addEventListener('mouseenter',function(){showTip(el,text)});el.addEventListener('mouseleave',hideTip);el.addEventListener('touchstart',function(e){e.preventDefault();showTip(el,text);setTimeout(hideTip,3000)},{passive:false})});
function initChart(svg){var cid=svg.id,tt=document.getElementById('tt_'+cid),tl=document.getElementById('ttl_'+cid),tb=document.getElementById('ttb_'+cid),tv=document.getElementById('ttv_'+cid),tt2=document.getElementById('ttt_'+cid);if(!tt)return;var pts=svg.querySelectorAll('.hover-point');
function handleMove(mx){var r=svg.getBoundingClientRect(),sw=svg.viewBox.baseVal.width;var cl=null,md=1e9;pts.forEach(function(p){var cx=parseFloat(p.getAttribute('cx')),d=Math.abs(cx-mx);if(d<md){md=d;cl=p}});if(cl&&md<80){var cx=parseFloat(cl.getAttribute('cx')),cy=parseFloat(cl.getAttribute('cy')),v=cl.getAttribute('data-val'),t=cl.getAttribute('data-time'),u=cl.getAttribute('data-unit');tt.setAttribute('visibility','visible');tl.setAttribute('x1',cx);tl.setAttribute('x2',cx);var bx=cx-70;if(bx<5)bx=5;if(bx>sw-150)bx=sw-150;var flip=cy<60;var by=flip?cy+12:cy-50;tb.setAttribute('x',bx);tb.setAttribute('y',by);tv.setAttribute('x',bx+70);tv.setAttribute('y',by+22);tv.textContent=v+u;tt2.setAttribute('x',bx+70);tt2.setAttribute('y',by+37);tt2.textContent=t}else{tt.setAttribute('visibility','hidden')}}
svg.addEventListener('mousemove',function(e){var r=svg.getBoundingClientRect(),sw=svg.viewBox.baseVal.width;handleMove((e.clientX-r.left)*sw/r.width)});
svg.addEventListener('mouseleave',function(){tt.setAttribute('visibility','hidden')});
svg.addEventListener('touchmove',function(e){e.preventDefault();var touch=e.touches[0];var r=svg.getBoundingClientRect(),sw=svg.viewBox.baseVal.width;handleMove((touch.clientX-r.left)*sw/r.width)},{passive:false});
svg.addEventListener('touchend',function(){setTimeout(function(){tt.setAttribute('visibility','hidden')},1500)})}
document.querySelectorAll('.chart-svg').forEach(initChart)})();`;

// ─── Report Generator ───────────────────────────────────────────────────────

function generateReport(data) {
  const battery = data.battery || {};
  const nand = data.nand_smart || {};
  const crashes = data.crashes || {};
  const appExitsData = data.app_exits || { items: [] };
  const appExits = appExitsData.items || appExitsData; // backward compat
  const writersData = data.app_nand_writers || { items: [] };
  const writers = (writersData.items || writersData).slice(0, 8);
  const appsData = data.app_screen_time || { items: [] };
  const apps = (appsData.items || appsData).slice(0, 8);
  const mem = (data.app_memory || []).slice(0, 8);
  const devCfg = data.device_config || {};
  const trend = data.battery_trend || [];
  const gpsData = data.gps_usage || [];
  const gps = (gpsData.items || gpsData).slice(0, 8);
  const netData = data.network_usage || { items: [] };
  const net = (netData.items || netData).slice(0, 8);
  const energyData = data.app_energy || [];
  const energy = (energyData.items || energyData).slice(0, 8);
  const cpuData = data.app_cpu || [];
  const cpu = (cpuData.items || cpuData).slice(0, 8);
  const procExitsData = data.process_exits || [];
  const procExits = (procExitsData.items || procExitsData).slice(0, 8);
  const brightTrend = data.brightness_trend || [];

  const tz = data.timezone || { offsetMinutes: 0, label: 'UTC' };
  const tzMin = tz.offsetMinutes || 0;
  const tzLabel = tz.label || 'UTC';

  const lang = detectLanguage(data, tzMin);
  const isCn = lang === 'zh';

  const healthPct = battery.health_pct || 0;
  const nandPct = nand.percent_used || 0;
  const nandRemain = 100 - nandPct;
  const cycles = battery.cycle_count || 0;
  const powerHours = nand.power_on_hours || 0;
  const totalBoots = nand.total_boots || 0;
  const totalCrashes = crashes.total || 0;
  const hwTb = (nand.host_writes_sectors || 0) * 512 / 1024 ** 4;
  const hrTb = (nand.host_reads_sectors || 0) * 512 / 1024 ** 4;
  const nwTb = (nand.nand_writes_sectors || 0) * 512 / 1024 ** 4;
  const nrTb = (nand.nand_reads_sectors || 0) * 512 / 1024 ** 4;

  const crashDetails = crashes.details || [];

  // Jetsam total kills (sum of all app kill counts)
  const jetsamExits = appExits.filter(e => e.reason_code === 1);
  const totalKills = jetsamExits.reduce((s, e) => s + (e.count || 0), 0);

  const generatedAt = fmtDatetimeFull(Math.floor(Date.now() / 1000), tzMin);
  let logRange = '';
  if (trend.length) logRange = `${fmtDatetimeFull(trend[0].ts, tzMin)} — ${fmtDatetimeFull(trend[trend.length - 1].ts, tzMin)}`;

  const soc = devCfg.soc || '';
  const SOC_MAP = {
    't8101': 'A14 Bionic', 't8103': 'M1', 't6000': 'M1 Pro', 't6001': 'M1 Max', 't6002': 'M1 Ultra',
    't8110': 'A15 Bionic', 't8112': 'A16 Bionic',
    't8120': 'A17 Pro', 't8130': 'M4',
    't6030': 'A18', 't6031': 'A18 Pro',
  };
  const MODEL_MAP = {
    't8101': 'iPhone 12', 't8110': 'iPhone 13 Pro',
    't8112': 'iPhone 14 Pro', 't8120': 'iPhone 15 Pro',
    't6030': 'iPhone 16', 't6031': 'iPhone 16 Pro',
  };
  const model = MODEL_MAP[soc] || soc;
  const socName = SOC_MAP[soc] || soc;

  const deviceInfo = [
    [isCn ? '型号' : 'Model', model],
    [isCn ? '芯片' : 'SoC', `${socName} (${soc})`],
    [isCn ? '存储' : 'Storage', `${devCfg.disk_size_gb || '?'} GB`],
    [isCn ? '可用' : 'Free', `${devCfg.free_space_gb || '?'} GB`],
  ];

  const metaLines = [
    `${isCn ? '电量/崩溃日志' : 'Battery/Crash log'}: ${logRange} (${isCn ? '约' : '~'}${Math.round((trend.length ? (trend[trend.length - 1].ts - trend[0].ts) : 0) / 3600)}h)`,
    `${isCn ? '报告生成' : 'Generated'}: ${generatedAt} (${tzLabel})`,
    `Analyzer: v${VERSION}`,
  ];

  // ─── KPI ───
  const hC = healthColor(healthPct);
  const nC = healthColor(nandRemain);
  // Cycle count color: >800 red, >500 yellow, else default
  const cycleColor = cycles >= 800 ? '#ff3b30' : cycles >= 500 ? '#ff9f0a' : null;
  const kpiItems = [
    [`${healthPct}%`, isCn ? '电池健康' : 'Battery', hC],
    [String(cycles), isCn ? '充电循环' : 'Cycles', cycleColor],
    [`${nandRemain}%`, isCn ? '闪存剩余' : 'NAND Left', nC],
    [`${totalCrashes}`, isCn ? '日志崩溃' : 'Crashes', totalCrashes > 20 ? '#ff3b30' : null],
    [`${totalKills}`, isCn ? '杀后台次数' : 'Kills', totalKills > 200 ? '#ff9f0a' : null],
  ];
  const kpiHtml = '<div class="kpi-row">' + kpiItems.map(([val, lbl, color]) =>
    `<div class="kpi"><div class="val"${color ? ` style="color:${color}"` : ''}>${val}</div><div class="lbl">${lbl}</div></div>`
  ).join('') + '</div>';

  const deviceStrip = '<div class="device-strip">' +
    deviceInfo.map(([k, v]) => `<div class="item"><div class="val">${v}</div><div class="lbl">${k}</div></div>`).join('') +
    '</div>';

  const T = text => `<i class="tip" data-tip="${text}">?</i>`;

  // ─── Battery Card ───
  const batCard = `<div class="card"><div class="card-title">${isCn ? '电池详情' : 'Battery'}</div>
<div class="stat-big" style="color:${hC}">${healthPct}%</div>
<div class="stat-sub">${battery.current_max_capacity_mah || '?'} / ${battery.design_capacity_mah || '?'} mAh</div>
<div class="bar"><div style="width:${healthPct}%;background:${hC}"></div></div>
<div style="margin-top:8px">
<div class="stat-row"><span class="k">${isCn ? '循环次数' : 'Cycles'}</span><span class="v">${cycles}</span></div>
<div class="stat-row"><span class="k">${isCn ? '设计容量' : 'Design'}</span><span class="v">${battery.design_capacity_mah || '?'} mAh</span></div>
<div class="stat-row"><span class="k">${isCn ? '当前容量' : 'Current'}</span><span class="v">${battery.current_max_capacity_mah || '?'} mAh</span></div>
<div class="stat-row"><span class="k">${isCn ? '容量损耗' : 'Degraded'}</span><span class="v">${(battery.design_capacity_mah || 0) - (battery.current_max_capacity_mah || 0)} mAh (${(100 - healthPct).toFixed(1)}%)</span></div>
<div class="stat-row"><span class="k">${isCn ? '温度' : 'Temp'}</span><span class="v">${battery.temperature_c || '?'}°C</span></div>
<div class="stat-row"><span class="k">${isCn ? '电压' : 'Voltage'}</span><span class="v">${battery.voltage_mv || '?'} mV</span></div>
<div class="stat-row"><span class="k">${isCn ? '标称容量' : 'Nominal'}</span><span class="v">${battery.nominal_capacity_mah || 'N/A'} mAh</span></div>
</div></div>`;

  // ─── NAND Card ───
  const pe = nand.avg_tlc_pe_cycles || 0;
  const eol = nand.eol_cycles || 3000;
  const pePct = Math.round(pe / eol * 1000) / 10;
  const nandCard = `<div class="card"><div class="card-title">${isCn ? '闪存健康' : 'NAND Flash'}</div>
<div class="stat-big" style="color:${nC}">${nandRemain}%</div>
<div class="stat-sub">${isCn ? '剩余寿命' : 'Remaining'}</div>
<div class="bar"><div style="width:${nandRemain}%;background:${nC}"></div></div>
<div style="margin-top:8px">
<div class="stat-row"><span class="k">${isCn ? '主机写入' : 'Host write'}${T(isCn ? 'iOS系统请求写入的数据量。你保存照片、安装App等操作都算在这里' : 'Data written as requested by iOS')}</span><span class="v">${hwTb.toFixed(1)} TB</span></div>
<div class="stat-row"><span class="k">${isCn ? '主机读取' : 'Host read'}${T(isCn ? 'iOS系统请求读取的数据量' : 'Data read as requested by iOS')}</span><span class="v">${hrTb.toFixed(1)} TB</span></div>
<div class="stat-row"><span class="k">${isCn ? '闪存写入' : 'NAND write'}${T(isCn ? '闪存芯片实际写入的物理数据量，因垃圾回收和磨损均衡机制，通常大于主机写入量' : 'Physical data written to NAND, exceeds host writes due to GC')}</span><span class="v">${nwTb.toFixed(1)} TB</span></div>
<div class="stat-row"><span class="k">${isCn ? '闪存读取' : 'NAND read'}${T(isCn ? '闪存芯片实际读取的物理数据量' : 'Physical data read from NAND')}</span><span class="v">${nrTb.toFixed(1)} TB</span></div>
<div class="stat-row"><span class="k">PE ${isCn ? '擦写' : ''}${T(isCn ? `闪存每个存储单元可擦除重新写入的次数。TLC闪存典型寿命约3000次，到达后该单元可能失效。当前已用${pePct}%，剩余${Math.round((1 - pePct / 100) * eol)}次` : `Program-Erase cycles per cell. TLC ~3000. Currently ${pePct}% used`)}</span><span class="v">${pe} / ${eol} (${pePct}%)</span></div>
<div class="stat-row"><span class="k">${isCn ? '坏块' : 'Bad'}${T(isCn ? 'NAND中标记为不可用的存储块。出厂坏块是生产时检测到的缺陷，属于正常范围。增长坏块是在使用中新增的，表示闪存老化' : 'Unusable blocks. Factory defects normal. Grown indicates aging')}</span><span class="v">${nand.grown_bad_blocks || 0} ${isCn ? '增长' : 'grown'} / ${nand.factory_bad_blocks || 0} ${isCn ? '出厂' : 'factory'}</span></div>
<div class="stat-row"><span class="k">WAF${T(isCn ? `写入放大系数 = 闪存实际写入量 ÷ 主机写入量。因为闪存必须先擦除整个块才能写入新数据（就像擦黑笔字要整面擦），所以实际写入量总是大于你请求的量。1.0=完美无浪费，当前${nand.write_amp || '?'}意味着每写1TB数据闪存实际写${nand.write_amp || '?'}TB` : `Write Amp = NAND writes / host writes. Flash erases whole blocks before writing. 1.0=perfect. Current ${nand.write_amp || '?'}`)}</span><span class="v">${nand.write_amp || 'N/A'}</span></div>
<div class="stat-row"><span class="k">${isCn ? '累计通电' : 'Cumulative on'}${T(isCn ? `自上次抹掉所有内容后，设备的累计通电时间（关机期间不计入）和总开机次数。${Math.floor(powerHours / 24)}天是累计值，不是连续不关机` : `Powered-on time since last erase. ${Math.floor(powerHours / 24)}d is cumulative`)}</span><span class="v">${powerHours}h (${Math.floor(powerHours / 24)}${isCn ? '天' : 'd'}) / ${totalBoots}${isCn ? '次开机' : ' boots'}</span></div>
</div></div>`;

  // ─── Battery Chart ───
  let batChart = '';
  if (trend.length >= 2) {
    const spanH = (trend[trend.length - 1].ts - trend[0].ts) / 3600;
    const spanLabel = `（${isCn ? '约' : '~'}${spanH.toFixed(0)}${isCn ? '小时' : 'h'} ${isCn ? '日志' : 'log'}）`;
    const svg = interactiveChartSvg(trend, 'level', { height: 200, color: '#34c759', unit: '%', yMax: 100, warnLine: 20, chartId: 'bat', tzOffsetMinutes: tzMin });
    batChart = `<div class="card full"><div class="card-title">${isCn ? '电量趋势' : 'Battery Trend'} ${spanLabel}</div>${svg}</div>`;
  }

  // ─── Tables ───
  let writerRows = '';
  if (writers.length) {
    const maxW = writers[0].logical_writes_bytes || 1;
    for (const w of writers) {
      const wr = w.logical_writes_bytes || 0;
      const pct = wr / maxW * 100;
      const bc = pct > 60 ? '#ff3b30' : pct > 30 ? '#ff6723' : pct > 10 ? '#ff9f0a' : '#636366';
      writerRows += `<tr><td>${shortName(w.bundle_id)}</td><td style="font-weight:600">${fmtBytes(wr)}</td><td style="width:28%"><div class="bar"><div style="width:${pct}%;background:${bc}"></div></div></td></tr>`;
    }
  }

  let appRows = '';
  for (const a of apps) {
    appRows += `<tr><td>${shortName(a.bundle_id)}</td><td style="font-weight:600">${fmtSeconds(a.foreground_sec)}</td><td style="color:var(--sec)">${fmtSeconds(a.background_sec)}</td></tr>`;
  }

  let memRows = '';
  for (const m of mem) {
    const mb = (m.peak_memory_kb || 0) / 1024 / 1024;
    memRows += `<tr><td>${shortName(m.bundle_id)}</td><td>${mb.toFixed(0)} MB</td></tr>`;
  }

  let netRows = '';
  for (const n of net) {
    netRows += `<tr><td>${shortName(n.name)}</td><td>${fmtBytes(n.wifi_in_bytes + n.wifi_out_bytes)}</td><td>${fmtBytes(n.cellular_in_bytes + n.cellular_out_bytes)}</td></tr>`;
  }

  // ─── Brightness Chart ───
  let brightChart = '';
  if (brightTrend.length >= 2) {
    const svg = interactiveChartSvg(brightTrend, 'brightness', { height: 160, color: '#ff9f0a', unit: '', chartId: 'bright', tzOffsetMinutes: tzMin });
    brightChart = `<div class="card-grid" style="margin-top:10px"><div class="card full"><div class="card-title">${isCn ? '亮度趋势' : 'Brightness Trend'}</div>${svg}</div></div>`;
  }

  // ─── GPS & Process Exits ───
  let gpsRows = '';
  for (const g of gps) {
    gpsRows += `<tr><td>${shortName(g.bundle_id)}</td><td>${g.location_requests}</td></tr>`;
  }
  let procRows = '';
  for (const p of procExits) {
    procRows += `<tr><td>${shortName(p.name)}</td><td>${p.count}</td><td style="color:var(--sec)">${p.namespace || ''}</td></tr>`;
  }

  const na = isCn ? '暂无数据' : 'N/A';
  const al = isCn ? '应用' : 'App';

  // ─── Crash Card ───
  const jetsam = crashes.jetsam || 0;
  // Crash detail lines for disk write exceedance and Jetsam
  let crashDetailStr = '';
  if (crashDetails.length) {
    // Group Jetsam details by app
    const jetsamApps = {};
    const diskWriteApps = [];
    for (const d of crashDetails) {
      if (d.type === 'jetsam') {
        jetsamApps[d.app] = (jetsamApps[d.app] || 0) + 1;
      } else if (d.type === 'disk_writes') {
        diskWriteApps.push(d);
      }
    }
    for (const [app, cnt] of Object.entries(jetsamApps).sort((a, b) => b[1] - a[1]).slice(0, 5)) {
      crashDetailStr += `<div class="stat-row"><span class="k">${shortName(app)}</span><span class="v" style="color:#ff9f0a">${cnt}× Jetsam</span></div>`;
    }
    for (const d of diskWriteApps.slice(0, 3)) {
      crashDetailStr += `<div class="stat-row"><span class="k">${shortName(d.app)}</span><span class="v">${isCn ? '磁盘写入超限' : 'Disk write exceed'}</span></div>`;
    }
  }

  const crashCard = `<div class="card"><div class="card-title">${isCn ? '崩溃分析（近 48 小时）' : 'Crash Analysis (48h)'}</div>
<div class="stat-big" style="color:${totalCrashes > 20 ? '#ff3b30' : totalCrashes > 5 ? '#ff9f0a' : 'var(--sec)'}">${totalCrashes}</div>
<div class="stat-sub">${isCn ? '48小时内诊断日志中的崩溃/异常事件' : 'Crash/exception events in 48h logs'}</div>
<div style="margin-top:8px">
<div class="stat-row"><span class="k">Jetsam ${isCn ? '内存回收' : 'memory kill'}${T(isCn ? '系统内存不足时，iOS按优先级强制结束低优先级进程来释放内存。频繁出现说明内存压力大' : 'iOS kills low-priority processes when memory is low')}</span><span class="v" style="color:${jetsam > 10 ? '#ff3b30' : 'inherit'}">${jetsam}</span></div>
<div class="stat-row"><span class="k">Safari ${isCn ? '崩溃' : 'crash'}${T(isCn ? 'Safari浏览器异常退出，通常是网页JavaScript或内存问题导致' : 'Safari abnormal exit, usually JS or memory issues')}</span><span class="v">${crashes.safari || 0}</span></div>
<div class="stat-row"><span class="k">${isCn ? '磁盘写入超限' : 'Disk write exceed'}${T(isCn ? 'App在短时间内写入过多数据，被系统限制' : 'App wrote too much data, system throttled')}</span><span class="v">${crashes.disk_writes || 0}</span></div>
<div class="stat-row"><span class="k">CPU ${isCn ? '超限' : 'resource'}${T(isCn ? '进程持续高CPU占用被系统检测并记录' : 'Process sustained high CPU usage detected')}</span><span class="v">${crashes.cpu_resource || 0}</span></div>
<div class="stat-row"><span class="k">SFA ${isCn ? '安全事件' : 'security'}${T(isCn ? 'Apple安全框架事件，通常与钥匙串、CloudKit同步相关，一般无影响' : 'Apple security framework events, usually harmless')}</span><span class="v">${crashes.sfa || 0}</span></div>
<div class="stat-row"><span class="k">${isCn ? '其他' : 'Other'}</span><span class="v">${crashes.other || 0}</span></div>
${crashDetailStr}
</div></div>`;

  // ─── App Exits Card ───
  let appExitCard = '';
  const jetsamExitsTop = jetsamExits.slice(0, 8);
  if (jetsamExitsTop.length) {
    const rows = jetsamExitsTop.map(e =>
      `<tr><td>${shortName(e.bundle_id)}</td><td style="font-weight:600;color:#ff9f0a">${e.count}</td></tr>`
    ).join('');
    appExitCard = `<div class="card"><div class="card-title">${isCn ? '杀后台排行' : 'Jetsam Kill Ranking'} ${rangeLabel(appExitsData.min_ts, appExitsData.max_ts, tzMin, isCn)}</div>
<div class="stat-big" style="color:${totalKills > 200 ? '#ff9f0a' : 'var(--sec)'}">${totalKills}</div>
<div class="stat-sub" style="margin-bottom:8px">${isCn ? '系统因内存不足强制结束应用的总次数' : 'Total times system killed apps to reclaim memory'}</div>
<table><thead><tr><th>${al}</th><th>${isCn ? '被杀次数' : 'Kills'}</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  }

  // ─── Assemble HTML ───
  return `<!DOCTYPE html>
<html lang="${isCn ? 'zh-CN' : 'en'}">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${isCn ? 'iPhone 诊断报告' : 'iPhone Diagnostics'}</title>
<style>${CSS}</style></head>
<body>
<div class="hero">
<h1>${isCn ? 'iPhone 诊断报告' : 'iPhone Diagnostics Report'}</h1>
<div class="meta">${metaLines.join('<br>')}</div>
${deviceStrip}
</div>
<div class="wrap">
${kpiHtml}
<div class="card-grid">${batCard}${nandCard}</div>
<div class="card-grid" style="margin-top:10px">${batChart}</div>
<div class="card-grid" style="margin-top:10px">
${crashCard}
${appExitCard || `<div class="card"><div class="card-title">${isCn ? 'Jetsam 内存回收' : 'Jetsam Kills'}</div><div class="stat-sub">${na}</div></div>`}
</div>
<div class="card-grid" style="margin-top:10px">
<div class="card"><div class="card-title">${isCn ? '存储写入排行' : 'NAND Writes'} ${rangeLabel(writersData.min_ts, writersData.max_ts, tzMin, isCn)}</div>
<table><thead><tr><th>${al}</th><th>${isCn ? '写入' : 'Writes'}</th><th></th></tr></thead><tbody>${writerRows}</tbody></table></div>
<div class="card"><div class="card-title">${isCn ? '亮屏时间' : 'Screen Time'} ${rangeLabel(appsData.min_ts, appsData.max_ts, tzMin, isCn)}</div>
<table><thead><tr><th>${al}</th><th>${isCn ? '前台' : 'FG'}</th><th>${isCn ? '后台' : 'BG'}</th></tr></thead><tbody>${appRows}</tbody></table></div>
</div>
<div class="card-grid" style="margin-top:10px">
<div class="card"><div class="card-title">${isCn ? '内存峰值' : 'Peak Memory'}</div>
<div class="stat-sub" style="margin-bottom:8px">${isCn ? '日志期间观测到的峰值' : 'Peak observed during logging'}</div>
<table><thead><tr><th>${al}</th><th>${isCn ? '峰值' : 'Peak'}</th></tr></thead><tbody>${memRows || `<tr><td colspan=2 style="color:var(--ter)">${na}</td></tr>`}</tbody></table></div>
<div class="card"><div class="card-title">${isCn ? '网络流量' : 'Network'} ${rangeLabel(netData.min_ts, netData.max_ts, tzMin, isCn)}</div>
<table><thead><tr><th>${al}</th><th>WiFi</th><th>${isCn ? '蜂窝' : 'Cell'}</th></tr></thead><tbody>${netRows || `<tr><td colspan=3 style="color:var(--ter)">${na}</td></tr>`}</tbody></table></div>
</div>
<div class="card-grid" style="margin-top:10px">
<div class="card"><div class="card-title">${isCn ? '能耗排行' : 'Energy Usage'}</div>
<table><thead><tr><th>${al}</th><th>${isCn ? '能耗' : 'Energy'}</th></tr></thead><tbody>${energy.length ? energy.map(e => `<tr><td>${shortName(e.bundle_id)}</td><td>${((e.energy_nj || 0) / 1000).toFixed(1)} mWh</td></tr>`).join('') : `<tr><td colspan=2 style="color:var(--ter)">${na}</td></tr>`}</tbody></table></div>
<div class="card"><div class="card-title">${isCn ? 'CPU 排行' : 'CPU Usage'}</div>
<table><thead><tr><th>${al}</th><th>${isCn ? 'CPU时间' : 'CPU'}</th></tr></thead><tbody>${cpu.length ? cpu.map(c => `<tr><td>${shortName(c.name)}</td><td>${fmtSeconds(c.cpu_sec)}</td></tr>`).join('') : `<tr><td colspan=2 style="color:var(--ter)">${na}</td></tr>`}</tbody></table></div>
</div>
${brightChart}
<div class="card-grid" style="margin-top:10px">
<div class="card"><div class="card-title">${isCn ? 'GPS 使用' : 'Location Usage'}</div>
<table><thead><tr><th>${al}</th><th>${isCn ? '定位次数' : 'Requests'}</th></tr></thead><tbody>${gpsRows || `<tr><td colspan=2 style="color:var(--ter)">${na}</td></tr>`}</tbody></table></div>
<div class="card"><div class="card-title">${isCn ? '进程退出' : 'Process Exits'}</div>
<table><thead><tr><th>${al}</th><th>${isCn ? '次数' : 'Count'}</th><th>${isCn ? '原因' : 'Reason'}</th></tr></thead><tbody>${procRows || `<tr><td colspan=3 style="color:var(--ter)">${na}</td></tr>`}</tbody></table></div>
</div>
<div class="footer">iPhone Sysdiagnose Analyzer v${VERSION} · ${generatedAt} (${tzLabel})</div>
</div>
<script>${CHART_JS}</script>
</body></html>`;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

if (process.argv[1] && process.argv[1].endsWith('report.mjs')) {
  const args = process.argv.slice(2);
  let inputFile = null, outputFile = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '-o' || args[i] === '--output') outputFile = args[++i];
    else if (args[i] === '-h' || args[i] === '--help') {
      console.log('Usage: node report.mjs data.json [-o report.html]');
      process.exit(0);
    }
    else if (!inputFile) inputFile = args[i];
  }

  if (!inputFile) {
    console.error('Error: input JSON file required');
    console.error('Usage: node report.mjs data.json [-o report.html]');
    process.exit(1);
  }

  const data = JSON.parse(readFileSync(inputFile, 'utf-8'));
  const html = generateReport(data);
  if (outputFile) { writeFileSync(outputFile, html); console.error(`Report written to ${outputFile}`); }
  else process.stdout.write(html);
}

export { generateReport };
