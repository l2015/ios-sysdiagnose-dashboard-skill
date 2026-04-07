#!/usr/bin/env node
/**
 * iOS Sysdiagnose Report Generator
 * Generates an Apple HIG-style dark theme HTML report from extracted data.
 * Usage: node report.mjs data.json [-o report.html]
 */

import { readFileSync, writeFileSync } from 'node:fs';

const VERSION = '0.2.16';

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
    yMax = null, warnLine = null, chartId = 'chart', tzOffsetMinutes = 0,
    bands = null } = opts;

  if (points.length < 2) return '<div class="chart-empty">数据不足</div>';

  const pl = 52, pr = 20, pt = 16, pb = 42;
  const cw = width - pl - pr, ch = height - pt - pb;
  const t0 = points[0].ts, t1 = points[points.length - 1].ts;
  const tr = t1 - t0 || 1;
  const values = points.map(p => p[valueKey] || 0);
  const maxVal = yMax ?? Math.max(...values, 1);

  const tx = ts => pl + (ts - t0) / tr * cw;
  const ty = val => pt + ch - val / maxVal * ch;

  // Screen-on bands
  let bandsSvg = '';
  if (bands && bands.length) {
    for (const b of bands) {
      const x1 = Math.max(pl, tx(b.start)), x2 = Math.min(pl + cw, tx(b.end));
      if (x2 > x1 + 1) {
        bandsSvg += `<rect x="${x1.toFixed(1)}" y="${pt}" width="${(x2 - x1).toFixed(1)}" height="${ch}" fill="${b.color || '#34c759'}" opacity="${b.opacity || 0.08}"/>`;
      }
    }
  }

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
${bandsSvg}${timeSvg}${ySvg}
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

// ─── Donut Chart ────────────────────────────────────────────────────────────

function donutChartSvg(items, opts = {}) {
  const { size = 200, labelKey = 'label', valueKey = 'value', chartId = 'donut' } = opts;
  const cx = size / 2, cy = size / 2, r = size / 2 - 8, ir = r * 0.62;
  const total = items.reduce((s, i) => s + (i[valueKey] || 0), 0);
  if (!total) return '';
  const PALETTE = ['#30d158','#ff9f0a','#5e5ce6','#64d2ff','#bf5af2','#ff375f','#ffd60a','#ff6b35','#a2845e','#636366'];
  let angle = -Math.PI / 2;
  const arcs = [];
  const legend = [];
  items.forEach((item, i) => {
    const val = item[valueKey] || 0;
    const pct = val / total;
    const sweep = pct * Math.PI * 2;
    const a1 = angle, a2 = angle + sweep;
    const color = PALETTE[i % PALETTE.length];
    const largeArc = sweep > Math.PI ? 1 : 0;
    const gap = 0.02; // small gap between segments
    const a1g = a1 + gap, a2g = a2 - gap;
    if (a2g <= a1g) { angle = a2; return; }
    const x1o = cx + r * Math.cos(a1g), y1o = cy + r * Math.sin(a1g);
    const x2o = cx + r * Math.cos(a2g), y2o = cy + r * Math.sin(a2g);
    const x1i = cx + ir * Math.cos(a2g), y1i = cy + ir * Math.sin(a2g);
    const x2i = cx + ir * Math.cos(a1g), y2i = cy + ir * Math.sin(a1g);
    const la = (a2g - a1g) > Math.PI ? 1 : 0;
    arcs.push(`<path d="M${x1o.toFixed(1)},${y1o.toFixed(1)} A${r},${r} 0 ${la},1 ${x2o.toFixed(1)},${y2o.toFixed(1)} L${x1i.toFixed(1)},${y1i.toFixed(1)} A${ir},${ir} 0 ${la},0 ${x2i.toFixed(1)},${y2i.toFixed(1)} Z" fill="${color}" opacity=".85"/>`);
    legend.push({ label: item[labelKey], pct: (pct * 100).toFixed(1), color, val: fmtBytes(val) });
    angle = a2;
  });
  // Center text: top app name + percentage
  const topApp = legend[0];
  const legendHtml = legend.map(l =>
    `<div style="display:flex;align-items:center;gap:6px;font-size:.78em;line-height:1.8"><span style="width:10px;height:10px;border-radius:3px;background:${l.color};flex-shrink:0"></span><span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${l.label}</span><span style="color:var(--ter);font-size:.9em">${l.val}</span><span style="font-weight:600;width:42px;text-align:right">${l.pct}%</span></div>`
  ).join('');
  return `<div style="display:flex;gap:20px;align-items:center">
<div style="position:relative;width:${size}px;height:${size}px;flex-shrink:0">
<svg viewBox="0 0 ${size} ${size}" style="width:100%;height:100%" xmlns="http://www.w3.org/2000/svg">${arcs.join('')}</svg>
<div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;pointer-events:none">
<div style="font-size:1.4em;font-weight:700;letter-spacing:-.02em">${topApp.pct}%</div>
<div style="font-size:.7em;color:var(--ter);margin-top:2px">${topApp.label}</div>
</div></div>
<div style="flex:1;min-width:0">${legendHtml}</div></div>`;
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
th.sortable{cursor:pointer;user-select:none}
th.sortable:hover{color:var(--sec)}
th.sortable::after{content:' ⇅';opacity:.3;font-size:.8em}
th.sortable.asc::after{content:' ↑';opacity:.8}
th.sortable.desc::after{content:' ↓';opacity:.8}
.stat-help{font-size:.75em;color:var(--ter);margin-top:4px;line-height:1.4}
.mini-bar{display:inline-block;height:4px;border-radius:2px;vertical-align:middle;margin-left:6px}
.bat-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:12px;padding-top:10px;border-top:1px solid rgba(255,255,255,.05)}
.bat-stat{text-align:center}
.bat-stat-val{font-size:1.1em;font-weight:700}
.bat-stat-lbl{font-size:.68em;color:var(--ter);margin-top:2px;text-transform:uppercase;letter-spacing:.4px}
.period-btns{display:flex;gap:4px;margin-bottom:8px}
.period-btn{background:var(--border);border:none;color:var(--sec);font-size:.72em;padding:4px 12px;border-radius:8px;cursor:pointer;font-weight:600;letter-spacing:.3px;transition:background .15s,color .15s}
.period-btn:hover{color:var(--text)}
.period-btn.active{background:var(--green);color:#000}
.crash-toggle{cursor:pointer;color:var(--blue);font-size:.75em;font-style:normal;margin-left:4px;border:1px solid var(--blue);opacity:.6;transition:opacity .15s}
.crash-toggle:hover{opacity:1}
.crash-apps{padding:4px 0 4px 16px;border-left:2px solid var(--border);margin:0 0 4px 4px;font-size:.85em}
.donut-seg{cursor:pointer;transition:opacity .15s}
.donut-seg:hover{opacity:.75}
body.debug .stat-row,body.debug .kpi,body.debug .bat-stat{cursor:help;outline:1px dashed transparent;transition:outline-color .15s}
body.debug .stat-row:hover,body.debug .kpi:hover,body.debug .bat-stat:hover{outline-color:rgba(10,132,255,.4)}
body.debug #debug-badge{background:var(--blue);color:#000;border-color:var(--blue)}
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

// Table sorting
document.querySelectorAll('th.sortable').forEach(function(th){
th.addEventListener('click',function(){
var table=th.closest('table'),tbody=table.querySelector('tbody');
var rows=Array.from(tbody.querySelectorAll('tr'));
var idx=Array.from(th.parentNode.children).indexOf(th);
var isNum=th.dataset.type==='num';
var asc=th.classList.contains('asc');
table.querySelectorAll('th').forEach(function(h){h.classList.remove('asc','desc')});
th.classList.add(asc?'desc':'asc');
rows.sort(function(a,b){
var va=a.children[idx]?.textContent?.trim()||'';
var vb=b.children[idx]?.textContent?.trim()||'';
if(isNum){va=parseFloat(va.replace(/[^\\d.]/g,''))||0;vb=parseFloat(vb.replace(/[^\\d.]/g,''))||0}
return asc?(va>vb?-1:va<vb?1:0):(va<vb?-1:va>vb?1:0)});
rows.forEach(function(r){tbody.appendChild(r)})})});
function initChart(svg){var cid=svg.id,tt=document.getElementById('tt_'+cid),tl=document.getElementById('ttl_'+cid),tb=document.getElementById('ttb_'+cid),tv=document.getElementById('ttv_'+cid),tt2=document.getElementById('ttt_'+cid);if(!tt)return;var pts=svg.querySelectorAll('.hover-point');
function handleMove(mx){var r=svg.getBoundingClientRect(),sw=svg.viewBox.baseVal.width;var cl=null,md=1e9;pts.forEach(function(p){var cx=parseFloat(p.getAttribute('cx')),d=Math.abs(cx-mx);if(d<md){md=d;cl=p}});if(cl&&md<80){var cx=parseFloat(cl.getAttribute('cx')),cy=parseFloat(cl.getAttribute('cy')),v=cl.getAttribute('data-val'),t=cl.getAttribute('data-time'),u=cl.getAttribute('data-unit');tt.setAttribute('visibility','visible');tl.setAttribute('x1',cx);tl.setAttribute('x2',cx);var bx=cx-70;if(bx<5)bx=5;if(bx>sw-150)bx=sw-150;var flip=cy<60;var by=flip?cy+12:cy-50;tb.setAttribute('x',bx);tb.setAttribute('y',by);tv.setAttribute('x',bx+70);tv.setAttribute('y',by+22);tv.textContent=v+u;tt2.setAttribute('x',bx+70);tt2.setAttribute('y',by+37);tt2.textContent=t}else{tt.setAttribute('visibility','hidden')}}
svg.addEventListener('mousemove',function(e){var r=svg.getBoundingClientRect(),sw=svg.viewBox.baseVal.width;handleMove((e.clientX-r.left)*sw/r.width)});
svg.addEventListener('mouseleave',function(){tt.setAttribute('visibility','hidden')});
svg.addEventListener('touchmove',function(e){e.preventDefault();var touch=e.touches[0];var r=svg.getBoundingClientRect(),sw=svg.viewBox.baseVal.width;handleMove((touch.clientX-r.left)*sw/r.width)},{passive:false});
svg.addEventListener('touchend',function(){setTimeout(function(){tt.setAttribute('visibility','hidden')},1500)})}
document.querySelectorAll('.chart-svg').forEach(initChart)})();

// Crash toggle
window.toggleCrash=function(el){var id=el.getAttribute('data-target');var el2=document.getElementById(id);if(!el2)return;var vis=el2.style.display!=='none';el2.style.display=vis?'none':'block';el.textContent=vis?'▸':'▾'};

// Preview/Debug mode
window._debugMode=false;
window.toggleDebug=function(){window._debugMode=!window._debugMode;document.body.classList.toggle('debug',window._debugMode);document.getElementById('debug-badge').textContent=window._debugMode?'Debug':'Preview';document.getElementById('debug-badge').classList.toggle('active',window._debugMode)};
// In debug mode, clicking any stat-row shows source info
document.addEventListener('click',function(e){if(!window._debugMode)return;var row=e.target.closest('.stat-row,.kpi,.bat-stat,.donut-seg');if(!row){return}var info=row.getAttribute('data-source');if(!info){var label=row.querySelector('.k')?.textContent||row.querySelector('.bat-stat-lbl')?.textContent||'';info='Source: PowerLog / ASP SMART\\nField: '+label}var popup=document.getElementById('debug-popup');if(!popup){popup=document.createElement('div');popup.id='debug-popup';popup.style.cssText='position:fixed;background:#1c1c1e;border:1px solid #48484a;color:#f5f5f7;padding:10px 14px;border-radius:10px;font-size:.78em;z-index:9999;max-width:320px;white-space:pre-line;box-shadow:0 8px 24px rgba(0,0,0,.5)';document.body.appendChild(popup)}popup.textContent=info;popup.style.display='block';var r=row.getBoundingClientRect();popup.style.left=Math.max(8,Math.min(window.innerWidth-340,r.left))+'px';popup.style.top=(r.bottom+6)+'px';setTimeout(function(){popup.style.display='none'},4000)},{capture:true});

// Period switching
window.switchPeriod=function(chartId,days,btn){
var td=window._trendData;if(!td||td.id!==chartId)return;
var wrap=document.getElementById(chartId+'-chart-wrap');if(!wrap)return;
var pts=td.data;
if(days!=='all'){var cutoff=pts[pts.length-1].t-days*86400;pts=pts.filter(function(p){return p.t>=cutoff})}
if(pts.length<2)return;
// Update active button
btn.parentNode.querySelectorAll('.period-btn').forEach(function(b){b.classList.remove('active')});btn.classList.add('active');
// Rebuild bands
var bands=[],bs=null;
for(var i=0;i<pts.length;i++){if(pts[i].s&&!bs)bs=pts[i].t;if(!pts[i].s&&bs){bands.push({start:bs,end:pts[i].t});bs=null}}
if(bs)bands.push({start:bs,end:pts[pts.length-1].t});
// Render SVG client-side
var W=1000,H=200,pl=52,pr=20,pt=16,pb=42,cw=W-pl-pr,ch=H-pt-pb;
var t0=pts[0].t,t1=pts[pts.length-1].t,tr=t1-t0||1;
var vals=pts.map(function(p){return p.l||0}),maxV=100;
var tx=function(t){return pl+(t-t0)/tr*cw},ty=function(v){return pt+ch-v/maxV*ch};
var path=pts.map(function(p,i){return(i?'L':'M')+tx(p.t).toFixed(1)+','+ty(p.l||0).toFixed(1)}).join(' ');
var fill=path+' L'+tx(t1).toFixed(1)+','+(pt+ch)+' L'+tx(t0).toFixed(1)+','+(pt+ch)+' Z';
var bandsS=bands.map(function(b){var x1=Math.max(pl,tx(b.start)),x2=Math.min(pl+cw,tx(b.end));return x2>x1+1?'<rect x="'+x1.toFixed(1)+'" y="'+pt+'" width="'+(x2-x1).toFixed(1)+'" height="'+ch+'" fill="#34c759" opacity="0.06"/>':''}).join('');
var timeS='';for(var i=0;i<7;i++){var f=i/6,x=pl+f*cw,ts=t0+f*tr;var d=new Date((ts+td.tz*60)*1000);var lbl=(d.getUTCMonth()+1)+'/'+String(d.getUTCDate()).padStart(2,'0')+' '+String(d.getUTCHours()).padStart(2,'0')+':'+String(d.getUTCMinutes()).padStart(2,'0');timeS+='<text x="'+x.toFixed(0)+'" y="'+(pt+ch+18)+'" text-anchor="middle" class="axis-label">'+lbl+'</text><line x1="'+x.toFixed(0)+'" y1="'+pt+'" x2="'+x.toFixed(0)+'" y2="'+(pt+ch)+'" class="grid-line"/>'}
var yS='';for(var i=0;i<5;i++){var val=i/4*maxV,y=ty(val);yS+='<text x="'+(pl-8)+'" y="'+(y+4)+'" text-anchor="end" class="axis-label">'+val.toFixed(0)+'%</text>'+(i>0?'<line x1="'+pl+'" y1="'+y.toFixed(1)+'" x2="'+(pl+cw)+'" y2="'+y.toFixed(1)+'" class="grid-line"/>':'')}
var wy=ty(20);var warn='<line x1="'+pl+'" y1="'+wy.toFixed(1)+'" x2="'+(pl+cw)+'" y2="'+wy.toFixed(1)+'" stroke="#ff3b30" stroke-width="1" stroke-dasharray="6,3" opacity=".5"/><text x="'+(pl+cw-4)+'" y="'+(wy-6)+'" fill="#ff3b30" font-size="11" text-anchor="end" font-weight="600">20%</text>';
var hover=pts.map(function(p){var x=tx(p.t),y=ty(p.l||0);var v=(p.l||0).toFixed(1);var dd=new Date((p.t+td.tz*60)*1000);var ts=dd.getUTCFullYear()+'-'+String(dd.getUTCMonth()+1).padStart(2,'0')+'-'+String(dd.getUTCDate()).padStart(2,'0')+' '+String(dd.getUTCHours()).padStart(2,'0')+':'+String(dd.getUTCMinutes()).padStart(2,'0')+':'+String(dd.getUTCSeconds()).padStart(2,'0');return'<circle cx="'+x.toFixed(1)+'" cy="'+y.toFixed(1)+'" r="8" fill="transparent" class="hover-point" data-val="'+v+'" data-time="'+ts+'" data-unit="%"/>'}).join('');
var svg='<svg viewBox="0 0 '+W+' '+H+'" style="width:100%;height:'+H+'px" xmlns="http://www.w3.org/2000/svg" class="chart-svg" id="'+chartId+'"><defs><linearGradient id="g_'+chartId+'" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#34c759" stop-opacity=".12"/><stop offset="100%" stop-color="#34c759" stop-opacity="0"/></linearGradient></defs>'+bandsS+timeS+yS+'<line x1="'+pl+'" y1="'+pt+'" x2="'+pl+'" y2="'+(pt+ch)+'" stroke="#3a3a3c" stroke-width="1"/><line x1="'+pl+'" y1="'+(pt+ch)+'" x2="'+(pl+cw)+'" y2="'+(pt+ch)+'" stroke="#3a3a3c" stroke-width="1"/><path d="'+fill+'" fill="url(#g_'+chartId+')"/><path d="'+path+'" fill="none" stroke="#34c759" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>'+warn+hover+'<g id="tt_'+chartId+'" class="chart-tooltip" visibility="hidden" pointer-events="none"><line id="ttl_'+chartId+'" x1="0" y1="'+pt+'" x2="0" y2="'+(pt+ch)+'" stroke="#8e8e93" stroke-width="1" stroke-dasharray="3"/><rect id="ttb_'+chartId+'" x="0" y="0" width="140" height="40" rx="10" fill="#2c2c2e" stroke="#48484a"/><text id="ttv_'+chartId+'" x="0" y="0" fill="#fff" font-size="15" font-weight="700" text-anchor="middle"></text><text id="ttt_'+chartId+'" x="0" y="0" fill="#8e8e93" font-size="11" text-anchor="middle"></text></g></svg>';
wrap.innerHTML=svg;
initChart(wrap.querySelector('.chart-svg'));
};`;

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
  const usageSum = data.usage_summary || {};
  const trendData = data.battery_trend || { items: [] };
  const trend = trendData.items || trendData;
  const gpsData = data.gps_usage || { items: [] };
  const gps = (gpsData.items || gpsData).slice(0, 8);
  const netData = data.network_usage || { items: [] };
  const net = (netData.items || netData).slice(0, 8);
  const energyData = data.app_energy || { items: [] };
  const energy = (energyData.items || energyData).slice(0, 8);
  const cpuData = data.app_cpu || { items: [] };
  const cpu = (cpuData.items || cpuData).slice(0, 8);
  const procExitsData = data.process_exits || { items: [] };
  const procExits = (procExitsData.items || procExitsData).slice(0, 8);
  const brightData = data.brightness_trend || { items: [] };
  const brightTrend = brightData.items || brightData;

  const tz = data.timezone || { offsetMinutes: 0, label: 'UTC' };
  const tzMin = tz.offsetMinutes || 0;
  const tzLabel = tz.label || 'UTC';

  const lang = detectLanguage(data, tzMin);
  const isCn = lang === 'zh';
  const T = text => `<i class="tip" data-tip="${text}">?</i>`;

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

  // Usage summary
  if (usageSum.screen_on_sec > 0) {
    const days = usageSum.max_ts && usageSum.min_ts ? Math.max(1, Math.round((usageSum.max_ts - usageSum.min_ts) / 86400)) : 1;
    const avgOn = Math.round(usageSum.screen_on_sec / days / 3600 * 10) / 10;
    const totalH = Math.floor(usageSum.screen_on_sec / 3600);
    const totalM = Math.floor((usageSum.screen_on_sec % 3600) / 60);
    const rangeStr = usageSum.max_ts && usageSum.min_ts
      ? `${fmtDatetime(usageSum.min_ts, tzMin).split(' ')[0]}~${fmtDatetime(usageSum.max_ts, tzMin).split(' ')[0]}(${days}${isCn ? '天' : 'd'})`
      : '';
    deviceInfo.push([`${isCn ? '总亮屏' : 'Screen On'}${T(isCn ? `统计周期 ${rangeStr}，日均 ${avgOn} 小时` : `Period: ${rangeStr}, avg ${avgOn}h/d`)}`, `${totalH}${isCn ? '时' : 'h'}${totalM}${isCn ? '分' : 'm'} (~${avgOn}h/${isCn ? '天' : 'd'})`]);
  }
  if (usageSum.fcc_max_mah) {
    deviceInfo.push([`${isCn ? '电池FCC' : 'FCC'}${T(isCn ? 'Full Charge Capacity，电池实际能充进的最大电量。随使用衰减，此处显示记录到的最低~最高值' : 'Full Charge Capacity. Range shows min~max observed')}`, `${usageSum.fcc_min_mah}~${usageSum.fcc_max_mah} mAh`]);
  }
  if (usageSum.total_op_hours) {
    deviceInfo.push([`${isCn ? '累计通电' : 'Cum. On'}${T(isCn ? '自上次"抹掉所有内容"以来的累计通电时间，关机不计入' : 'Cumulative powered-on time since last erase')}`, `${Math.round(usageSum.total_op_hours / 24)}${isCn ? '天' : 'd'}`]);
  }

  const metaLines = [
    `${isCn ? '日志范围' : 'Log range'}: ${logRange}`,
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

  // ─── Battery Card ───
  const batCard = `<div class="card"><div class="card-title">${isCn ? '电池详情' : 'Battery'}</div>
<div class="stat-big" style="color:${hC}">${healthPct}%</div>
<div class="stat-sub">${battery.current_max_capacity_mah || '?'} / ${battery.design_capacity_mah || '?'} mAh</div>
<div class="bar"><div style="width:${healthPct}%;background:${hC}"></div></div>
<div style="margin-top:8px">
<div class="stat-row" data-source="PLBatteryAgent_EventBackward_Battery.CycleCount"><span class="k">${isCn ? '循环次数' : 'Cycles'}</span><span class="v">${cycles}</span></div>
<div class="stat-row" data-source="PLBatteryAgent_EventBackward_Battery.DesignCapacity"><span class="k">${isCn ? '设计容量' : 'Design'}</span><span class="v">${battery.design_capacity_mah || '?'} mAh</span></div>
<div class="stat-row" data-source="PLBatteryAgent_EventBackward_Battery.AppleRawMaxCapacity"><span class="k">${isCn ? '当前容量' : 'Current'}</span><span class="v">${battery.current_max_capacity_mah || '?'} mAh</span></div>
<div class="stat-row" data-source="计算: DesignCapacity - AppleRawMaxCapacity"><span class="k">${isCn ? '容量损耗' : 'Degraded'}</span><span class="v">${(battery.design_capacity_mah || 0) - (battery.current_max_capacity_mah || 0)} mAh (${(100 - healthPct).toFixed(1)}%)</span></div>
<div class="stat-row" data-source="PLBatteryAgent_EventBackward_Battery.Temperature"><span class="k">${isCn ? '温度' : 'Temp'}</span><span class="v">${battery.temperature_c || '?'}°C</span></div>
<div class="stat-row" data-source="PLBatteryAgent_EventBackward_Battery.Voltage"><span class="k">${isCn ? '电压' : 'Voltage'}</span><span class="v">${battery.voltage_mv || '?'} mV</span></div>
<div class="stat-row" data-source="PLBatteryAgent_EventBackward_Battery.NominalChargeCapacity"><span class="k">${isCn ? '标称容量' : 'Nominal'}</span><span class="v">${battery.nominal_capacity_mah || 'N/A'} mAh</span></div>
</div></div>`;

  // ─── NAND Card ───
  const pe = nand.avg_tlc_pe_cycles || 0;
  const eol = nand.max_native_endurance || nand.eol_cycles || null;
  const pePct = eol ? Math.round(pe / eol * 1000) / 10 : null;
  const nandCard = `<div class="card"><div class="card-title">${isCn ? '闪存健康' : 'NAND Flash'}</div>
<div class="stat-big" style="color:${nC}">${nandRemain}%</div>
<div class="stat-sub">${isCn ? '剩余寿命' : 'Remaining'}</div>
<div class="bar"><div style="width:${nandRemain}%;background:${nC}"></div></div>
<div style="margin-top:8px">
<div class="stat-row" data-source="ASPSnapshots/asptool_snapshot.log → hostWrites"><span class="k">${isCn ? '主机写入' : 'Host write'}${T(isCn ? 'iOS系统请求写入的数据量' : 'Data written as requested by iOS')}</span><span class="v">${hwTb.toFixed(1)} TB</span></div>
<div class="stat-row" data-source="ASPSnapshots/asptool_snapshot.log → hostReads"><span class="k">${isCn ? '主机读取' : 'Host read'}${T(isCn ? 'iOS系统请求读取的数据量' : 'Data read as requested by iOS')}</span><span class="v">${hrTb.toFixed(1)} TB</span></div>
<div class="stat-row" data-source="ASPSnapshots/asptool_snapshot.log → nandWrites"><span class="k">${isCn ? '闪存写入' : 'NAND write'}${T(isCn ? '闪存芯片实际写入的物理数据量，因垃圾回收和磨损均衡机制，通常大于主机写入量' : 'Physical data written to NAND, exceeds host writes due to GC')}</span><span class="v">${nwTb.toFixed(1)} TB</span></div>
<div class="stat-row" data-source="ASPSnapshots/asptool_snapshot.log → nandReads"><span class="k">${isCn ? '闪存读取' : 'NAND read'}${T(isCn ? '闪存芯片实际读取的物理数据量' : 'Physical data read from NAND')}</span><span class="v">${nrTb.toFixed(1)} TB</span></div>
<div class="stat-row" data-source="ASPSnapshots/asptool_snapshot.log → averageTLCPECycles / maxNativeEndurance"><span class="k">PE ${isCn ? '擦写' : ''}${T(isCn ? '闪存每个存储单元可擦除重新写入的次数，到达后该单元可能失效' : 'Program-Erase cycles per cell')}</span><span class="v">${pe}${eol ? ` / ${eol} (${pePct}%)` : ''}</span></div>
<div class="stat-row" data-source="ASPSnapshots/asptool_snapshot.log → numGrownBad / numFactoryBad"><span class="k">${isCn ? '坏块' : 'Bad'}${T(isCn ? 'NAND中标记为不可用的存储块' : 'Unusable blocks')}</span><span class="v">${nand.grown_bad_blocks || 0} ${isCn ? '增长' : 'grown'} / ${nand.factory_bad_blocks || 0} ${isCn ? '出厂' : 'factory'}</span></div>
<div class="stat-row" data-source="计算: nandWrites / hostWrites"><span class="k">WAF${T(isCn ? '写入放大系数 = 闪存实际写入量 ÷ 主机写入量' : 'Write Amp = NAND writes / host writes')}</span><span class="v">${nand.write_amp || 'N/A'}</span></div>
<div class="stat-row" data-source="ASPSnapshots/asptool_snapshot.log → powerOnHours / boots"><span class="k">${isCn ? '累计通电' : 'Cumulative on'}${T(isCn ? '自上次抹掉所有内容后的累计通电时间' : 'Powered-on time since last erase')}</span><span class="v">${powerHours}h (${Math.floor(powerHours / 24)}${isCn ? '天' : 'd'}) / ${totalBoots}${isCn ? '次开机' : ' boots'}</span></div>
</div></div>`;

  // ─── Battery Chart ───
  let batChart = '';
  if (trend.length >= 2) {
    // Build screen-on bands from brightness data
    const bands = [];
    let bandStart = null;
    for (const p of trend) {
      if (p.screen_on && !bandStart) bandStart = p.ts;
      if (!p.screen_on && bandStart) {
        bands.push({ start: bandStart, end: p.ts, color: '#34c759', opacity: 0.06 });
        bandStart = null;
      }
    }
    if (bandStart) bands.push({ start: bandStart, end: trend[trend.length - 1].ts, color: '#34c759', opacity: 0.06 });

    const svg = interactiveChartSvg(trend, 'level', { height: 200, color: '#34c759', unit: '%', yMax: 100, warnLine: 20, chartId: 'bat', tzOffsetMinutes: tzMin, bands });
    const bSum = data.battery_summary || {};
    let statsHtml = '';
    if (bSum.avg_discharge_pct_per_day) {
      statsHtml = `<div class="bat-stats">
<div class="bat-stat"><div class="bat-stat-val">${bSum.avg_discharge_pct_per_day}%</div><div class="bat-stat-lbl">${isCn ? '日均消耗' : 'Daily drain'}</div></div>
<div class="bat-stat"><div class="bat-stat-val">${bSum.avg_discharge_rate_pct_h}%/h</div><div class="bat-stat-lbl">${isCn ? '放电速率' : 'Discharge'}</div></div>
<div class="bat-stat"><div class="bat-stat-val">${bSum.avg_charge_rate_pct_h}%/h</div><div class="bat-stat-lbl">${isCn ? '充电速率' : 'Charge'}</div></div>
<div class="bat-stat"><div class="bat-stat-val">${bSum.charge_sessions || 0}</div><div class="bat-stat-lbl">${isCn ? '充电次数' : 'Charges'}</div></div>
</div>`;
    }
    const legendHtml = bands.length ? `<div style="margin-top:6px;font-size:.72em;color:var(--ter)"><span style="display:inline-block;width:12px;height:8px;background:#34c759;opacity:.3;border-radius:2px;vertical-align:middle;margin-right:4px"></span>${isCn ? '绿色背景 = 亮屏' : 'Green = screen on'}</div>` : '';
    const trendJson = JSON.stringify(trend.map(p => ({t:p.ts, l:p.level, s:p.screen_on?1:0, c:p.charging?1:0})));
    const spanSec = trend.length ? trend[trend.length-1].ts - trend[0].ts : 0;
    const showDay = spanSec > 86400*2;
    const showWeek = spanSec > 86400*8;
    let periodBtns = '';
    if (showDay || showWeek) {
      periodBtns = '<div class="period-btns">';
      if (showWeek) periodBtns += `<button class="period-btn" data-range="all" onclick="switchPeriod('bat','all',this)">${isCn ? '全部' : 'All'}</button>`;
      if (showWeek) periodBtns += `<button class="period-btn" data-range="30" onclick="switchPeriod('bat',30,this)">30${isCn ? '天' : 'd'}</button>`;
      if (showDay) periodBtns += `<button class="period-btn" data-range="7" onclick="switchPeriod('bat',7,this)">7${isCn ? '天' : 'd'}</button>`;
      if (showDay) periodBtns += `<button class="period-btn active" data-range="1" onclick="switchPeriod('bat',1,this)">24${isCn ? '时' : 'h'}</button>`;
      periodBtns += '</div>';
    }
    batChart = `<div class="card full"><div class="card-title">${isCn ? '电量趋势' : 'Battery Trend'} ${rangeLabel(trendData.min_ts, trendData.max_ts, tzMin, isCn)}</div>${periodBtns}<div id="bat-chart-wrap">${svg}</div>${legendHtml}${statsHtml}<script>window._trendData={id:'bat',tz:${tzMin},data:${trendJson}};</script></div>`;
  }

  // ─── Tables ───
  // NAND writes donut chart
  let writerDonut = '';
  if (writers.length) {
    const topWriters = writers.slice(0, 8).map(w => ({ label: shortName(w.bundle_id), value: w.logical_writes_bytes || 0 }));
    // If there are more than 8, add "其他" (Others)
    if (writers.length > 8) {
      const othersSum = writers.slice(8).reduce((s, w) => s + (w.logical_writes_bytes || 0), 0);
      if (othersSum > 0) topWriters.push({ label: isCn ? '其他' : 'Others', value: othersSum });
    }
    writerDonut = donutChartSvg(topWriters, { size: 200, chartId: 'nand' });
  }

  let appRows = '';
  for (const a of apps) {
    const fmtHM = s => { s = Math.floor(s||0); const h = Math.floor(s/3600), m = Math.floor((s%3600)/60); return `${h}时${m}分`; };
    appRows += `<tr><td>${shortName(a.bundle_id)}</td><td style="font-weight:600">${fmtHM(a.foreground_sec)}</td><td style="color:var(--sec)">${fmtHM(a.background_sec)}</td></tr>`;
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

  // ─── GPS ───
  let gpsRows = '';
  for (const g of gps) {
    gpsRows += `<tr><td>${shortName(g.bundle_id)}</td><td>${g.location_requests}</td></tr>`;
  }

  const na = isCn ? '暂无数据' : 'N/A';
  const al = isCn ? '应用' : 'App';

  // ─── Crash Card ───
  // Crash card: inline expand icons for Jetsam/disk_writes
  const jetsam = crashes.jetsam || 0;
  const jetsamApps = {}, diskWriteApps = [];
  for (const d of crashDetails) {
    if (d.type === 'jetsam') jetsamApps[d.app] = (jetsamApps[d.app] || 0) + 1;
    else if (d.type === 'disk_writes') diskWriteApps.push(d);
  }
  const jetsamEntries = Object.entries(jetsamApps).sort((a, b) => b[1] - a[1]);

  let jetsamDetail = '';
  if (jetsamEntries.length) {
    jetsamDetail = `<div class="crash-apps" id="jetsam-apps" style="display:none">`;
    for (const [app, cnt] of jetsamEntries.slice(0, 8)) {
      jetsamDetail += `<div class="stat-row"><span class="k">${app}</span><span class="v" style="color:#ff9f0a">${cnt}×</span></div>`;
    }
    jetsamDetail += '</div>';
  }
  let diskDetail = '';
  if (diskWriteApps.length) {
    diskDetail = `<div class="crash-apps" id="disk-apps" style="display:none">`;
    for (const d of diskWriteApps.slice(0, 5)) {
      diskDetail += `<div class="stat-row"><span class="k">${d.app}</span><span class="v">${isCn ? '超限' : 'exceeded'}</span></div>`;
    }
    diskDetail += '</div>';
  }

  const jetsamToggle = jetsamEntries.length ? `<i class="tip crash-toggle" data-target="jetsam-apps" onclick="toggleCrash(this)" data-tip="${isCn ? '点击查看进程' : 'Show processes'}">▾</i>` : '';
  const diskToggle = diskWriteApps.length ? `<i class="tip crash-toggle" data-target="disk-apps" onclick="toggleCrash(this)" data-tip="${isCn ? '点击查看进程' : 'Show processes'}">▾</i>` : '';

  const crashCard = `<div class="card"><div class="card-title">${isCn ? '崩溃分析' : 'Crash Analysis'}</div>
<div class="stat-big" style="color:${totalCrashes > 20 ? '#ff3b30' : totalCrashes > 5 ? '#ff9f0a' : 'var(--sec)'}">${totalCrashes}</div>
<div class="stat-sub">${isCn ? '诊断日志中的崩溃/异常事件' : 'Crash/exception events in logs'}</div>
<div style="margin-top:8px">
<div class="stat-row"><span class="k">Jetsam ${isCn ? '内存回收' : 'memory kill'}${T(isCn ? '系统内存不足时强制结束进程释放内存' : 'iOS kills processes when memory low')}</span><span class="v" style="color:${jetsam > 10 ? '#ff3b30' : 'inherit'}">${jetsamToggle}${jetsam}</span></div>
${jetsamDetail}
<div class="stat-row"><span class="k">Safari ${isCn ? '崩溃' : 'crash'}${T(isCn ? 'Safari异常退出' : 'Safari abnormal exit')}</span><span class="v">${crashes.safari || 0}</span></div>
<div class="stat-row"><span class="k">${isCn ? '磁盘写入超限' : 'Disk write exceed'}${T(isCn ? 'App短时间写入过多被限制' : 'App wrote too much, throttled')}</span><span class="v">${diskToggle}${crashes.disk_writes || 0}</span></div>
${diskDetail}
<div class="stat-row"><span class="k">CPU ${isCn ? '超限' : 'resource'}${T(isCn ? '进程持续高CPU占用被记录' : 'High CPU usage detected')}</span><span class="v">${crashes.cpu_resource || 0}</span></div>
<div class="stat-row"><span class="k">SFA ${isCn ? '安全事件' : 'security'}${T(isCn ? 'Apple安全框架事件，通常无影响' : 'Security framework, usually harmless')}</span><span class="v">${crashes.sfa || 0}</span></div>
${crashes.other ? `<div class="stat-row"><span class="k">${isCn ? '其他' : 'Other'}</span><span class="v">${crashes.other}</span></div>` : ''}
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
<div id="debug-badge" onclick="toggleDebug()" style="position:fixed;top:12px;left:12px;z-index:100;background:var(--card);border:1px solid var(--border);color:var(--sec);font-size:.7em;padding:4px 10px;border-radius:8px;cursor:pointer;font-weight:600;letter-spacing:.3px;transition:all .15s" title="切换 Preview/Debug 模式">Preview</div>
<div class="wrap">
${kpiHtml}
<div class="card-grid">${batCard}${nandCard}</div>
<div class="card-grid" style="margin-top:10px">${batChart}</div>
<div class="card-grid" style="margin-top:10px">
${crashCard}
${appExitCard || `<div class="card"><div class="card-title">${isCn ? 'Jetsam 内存回收' : 'Jetsam Kills'}</div><div class="stat-sub">${na}</div></div>`}
</div>
<div class="card-grid" style="margin-top:10px">
<div class="card"><div class="card-title">${isCn ? '存储写入' : 'NAND Writes'} ${rangeLabel(writersData.min_ts, writersData.max_ts, tzMin, isCn)}</div>
${writerDonut || `<div class="stat-sub">${na}</div>`}</div>
<div class="card"><div class="card-title">${isCn ? '亮屏时间' : 'Screen Time'} ${rangeLabel(appsData.min_ts, appsData.max_ts, tzMin, isCn)}</div>
<table><thead><tr><th>${al}</th><th class="sortable" data-type="num">${isCn ? '前台' : 'FG'}</th><th class="sortable" data-type="num">${isCn ? '后台' : 'BG'}</th></tr></thead><tbody>${appRows}</tbody></table></div>
</div>
<div class="card-grid" style="margin-top:10px">
<div class="card"><div class="card-title">${isCn ? '内存峰值' : 'Peak Memory'}</div>
<div class="stat-sub" style="margin-bottom:8px">${isCn ? '日志期间观测到的峰值' : 'Peak observed during logging'}</div>
<table><thead><tr><th>${al}</th><th class="sortable" data-type="num">${isCn ? '峰值' : 'Peak'}</th></tr></thead><tbody>${memRows || `<tr><td colspan=2 style="color:var(--ter)">${na}</td></tr>`}</tbody></table></div>
<div class="card"><div class="card-title">${isCn ? '网络流量' : 'Network'} ${rangeLabel(netData.min_ts, netData.max_ts, tzMin, isCn)}</div>
<table><thead><tr><th>${al}</th><th class="sortable" data-type="num">WiFi</th><th class="sortable" data-type="num">${isCn ? '蜂窝' : 'Cell'}</th></tr></thead><tbody>${netRows || `<tr><td colspan=3 style="color:var(--ter)">${na}</td></tr>`}</tbody></table></div>
</div>
<div class="card-grid" style="margin-top:10px">
<div class="card"><div class="card-title">${isCn ? 'GPS 使用' : 'Location Usage'} ${rangeLabel(gpsData.min_ts, gpsData.max_ts, tzMin, isCn)}</div>
<table><thead><tr><th>${al}</th><th class="sortable" data-type="num">${isCn ? '定位次数' : 'Requests'}</th></tr></thead><tbody>${gpsRows || `<tr><td colspan=2 style="color:var(--ter)">${na}</td></tr>`}</tbody></table></div>
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
