"""
iPhone Sysdiagnose Report Generator
Apple HIG-inspired design with i18n, interactive charts, and correct data display.
"""
import argparse
import json
import sys
from datetime import datetime, timezone


def fmt_datetime(ts: float) -> str:
    """Format Unix timestamp as readable local time string."""
    return datetime.fromtimestamp(ts, tz=timezone.utc).strftime("%m/%d %H:%M")


def fmt_datetime_full(ts: float) -> str:
    """Format Unix timestamp as full readable string."""
    return datetime.fromtimestamp(ts, tz=timezone.utc).strftime("%Y-%m-%d %H:%M:%S")


def fmt_bytes(b: int | float | None) -> str:
    """Format bytes to human-readable string."""
    if not b:
        return "0 B"
    b = float(b)
    for unit in ["B", "KB", "MB", "GB", "TB"]:
        if abs(b) < 1024:
            return f"{b:.1f} {unit}"
        b /= 1024
    return f"{b:.1f} PB"


def fmt_seconds(s: float | None) -> str:
    """Format seconds to human-readable duration."""
    if not s:
        return "0s"
    s = int(s)
    if s < 60:
        return f"{s}s"
    if s < 3600:
        return f"{s // 60}m {s % 60}s"
    h = s // 3600
    m = (s % 3600) // 60
    if h < 24:
        return f"{h}h {m}m"
    d = h // 24
    h %= 24
    return f"{d}天 {h}时"


APP_NAMES = {
    "com.taobao.fleamarket": "淘宝",
    "com.taobao.taobao4iphone": "淘宝",
    "com.ss.iphone.ugc.Aweme": "抖音",
    "com.ss.iphone.ugc.Live.lite": "抖音直播",
    "com.tencent.xin": "微信",
    "com.xingin.discover": "小红书",
    "com.xunmeng.pinduoduo": "拼多多",
    "com.apple.mobilesafari": "Safari",
    "com.apple.mobilemail": "邮件",
    "com.apple.mobilephone": "电话",
    "com.apple.MobileSMS": "短信",
    "com.apple.mobileslideshow": "照片",
    "com.apple.Music": "音乐",
    "com.apple.podcasts": "播客",
    "com.apple.Maps": "地图",
    "com.apple.weather": "天气",
    "com.apple.mobilecal": "日历",
    "com.apple.reminders": "提醒事项",
    "com.apple.mobilenotes": "备忘录",
    "com.apple.AppStore": "App Store",
    "com.apple.Preferences": "设置",
    "com.apple.camera": "相机",
    "com.apple.mobiletimer": "时钟",
    "com.apple.Health": "健康",
    "com.apple.Fitness": "健身",
    "com.burbn.instagram": "Instagram",
    "com.google.chrome.ios": "Chrome",
    "com.spotify.client": "Spotify",
    "com.netease.mail": "网易邮箱",
    "com.netease.cloudmusic": "网易云音乐",
    "com.gotokeep.keep": "Keep",
    "com.alipay.iphoneclient": "支付宝",
    "com.meituan.takeoutnew": "美团",
    "com.sina.weibo": "微博",
    "com.zhihu.ios": "知乎",
    "tv.danmaku.bili": "B站",
    "searchd": "搜索",
    "healthd": "健康守护",
    "thermalmonitord": "温度监控",
    "backboardd": "系统UI",
    "mediaserverd": "媒体服务",
    "locationd": "定位服务",
    "wifid": "WiFi",
    "bluetoothd": "蓝牙",
}


def short_name(bundle_id: str) -> str:
    """Extract readable name from bundle ID with common app mappings."""
    if not bundle_id:
        return "未知"
    if bundle_id in APP_NAMES:
        return APP_NAMES[bundle_id]
    parts = bundle_id.split(".")
    if len(parts) >= 2:
        for key, name in APP_NAMES.items():
            kp = key.split(".")
            if len(kp) >= 2 and kp[0] == parts[0] and kp[1] == parts[1]:
                return name
    return parts[-1][:12] if parts else bundle_id


def detect_language(data: dict) -> str:
    """Detect device language from app bundle IDs."""
    all_bundles = set()
    for key in ["app_screen_time", "app_nand_writers", "app_memory", "app_energy", "app_cpu"]:
        for item in data.get(key, []):
            bid = item.get("bundle_id", "") or item.get("name", "")
            if bid:
                all_bundles.add(bid)
    cn_prefixes = {"com.taobao", "com.tencent", "com.ss.iphone", "com.xingin",
                   "com.xunmeng", "com.alipay", "com.sina", "com.netease",
                   "com.zhihu", "com.duowan", "tv.danmaku", "com.gotokeep",
                   "com.bilibili", "com.meituan"}
    for bundle in all_bundles:
        for prefix in cn_prefixes:
            if bundle.startswith(prefix):
                return "zh"
    return "en"


def health_color(pct: float | None) -> str:
    if pct is None:
        return "#636366"
    if pct >= 90:
        return "#34c759"
    if pct >= 80:
        return "#ff9f0a"
    return "#ff3b30"


def tip(text: str) -> str:
    """Generate a tooltip info icon."""
    return f'<span class="tip" data-tip="{text}">ⓘ</span>'


def interactive_chart_svg(points: list[dict], value_key: str,
                           width: int = 1000, height: int = 220,
                           color: str = "#34c759", unit: str = "%",
                           y_max: float | None = None,
                           warn_line: float | None = None,
                           chart_id: str = "chart") -> str:
    """Generate an interactive SVG chart with axes, labels, and hover tooltip."""
    if len(points) < 2:
        return '<div class="chart-empty">数据不足</div>'

    pad_left, pad_right, pad_top, pad_bottom = 52, 20, 16, 42
    chart_w = width - pad_left - pad_right
    chart_h = height - pad_top - pad_bottom

    t0, t1 = points[0]["ts"], points[-1]["ts"]
    tr = t1 - t0 if t1 != t0 else 1
    values = [p.get(value_key, 0) or 0 for p in points]
    max_val = y_max if y_max is not None else (max(values, default=1) or 1)
    min_val = 0

    def tx(ts):
        return pad_left + (ts - t0) / tr * chart_w

    def ty(val):
        return pad_top + chart_h - (val - min_val) / (max_val - min_val) * chart_h

    path_parts = []
    for i, p in enumerate(points):
        path_parts.append(f"{'M' if i == 0 else 'L'}{tx(p['ts']):.1f},{ty(p.get(value_key, 0) or 0):.1f}")
    path = " ".join(path_parts)
    fill_path = f"{path} L{tx(points[-1]['ts']):.1f},{pad_top + chart_h} L{tx(points[0]['ts']):.1f},{pad_top + chart_h} Z"

    # Time axis
    time_svg = ""
    for i in range(7):
        frac = i / 6
        x = pad_left + frac * chart_w
        ts = t0 + frac * tr
        time_svg += f'<text x="{x:.0f}" y="{pad_top + chart_h + 18}" text-anchor="middle" class="axis-label">{fmt_datetime(ts)}</text>'
        time_svg += f'<line x1="{x:.0f}" y1="{pad_top}" x2="{x:.0f}" y2="{pad_top + chart_h}" class="grid-line"/>'

    # Y axis
    y_svg = ""
    for i in range(5):
        frac = i / 4
        val = min_val + frac * (max_val - min_val)
        y = ty(val)
        y_svg += f'<text x="{pad_left - 8}" y="{y + 4}" text-anchor="end" class="axis-label">{val:.0f}{unit}</text>'
        if i > 0:
            y_svg += f'<line x1="{pad_left}" y1="{y:.1f}" x2="{pad_left + chart_w}" y2="{y:.1f}" class="grid-line"/>'

    # Warning line
    warn_svg = ""
    if warn_line is not None:
        wy = ty(warn_line)
        warn_svg = f'<line x1="{pad_left}" y1="{wy:.1f}" x2="{pad_left + chart_w}" y2="{wy:.1f}" stroke="#ff3b30" stroke-width="1" stroke-dasharray="6,3" opacity=".5"/><text x="{pad_left + chart_w - 4}" y="{wy - 6}" fill="#ff3b30" font-size="11" text-anchor="end" font-weight="600">{int(warn_line)}{unit}</text>'

    # Hover points
    hover_svg = ""
    for p in points:
        x, y = tx(p["ts"]), ty(p.get(value_key, 0) or 0)
        val = p.get(value_key, 0) or 0
        ts_str = fmt_datetime_full(p["ts"])
        hover_svg += f'<circle cx="{x:.1f}" cy="{y:.1f}" r="10" fill="transparent" class="hover-point" data-val="{val:.1f}" data-time="{ts_str}" data-unit="{unit}"/>'

    return f'''<svg viewBox="0 0 {width} {height}" style="width:100%;height:{height}px" xmlns="http://www.w3.org/2000/svg" class="chart-svg" id="{chart_id}">
    <defs><linearGradient id="grad_{chart_id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="{color}" stop-opacity=".12"/><stop offset="100%" stop-color="{color}" stop-opacity="0"/></linearGradient></defs>
    {time_svg}{y_svg}
    <line x1="{pad_left}" y1="{pad_top}" x2="{pad_left}" y2="{pad_top + chart_h}" stroke="#3a3a3c" stroke-width="1"/>
    <line x1="{pad_left}" y1="{pad_top + chart_h}" x2="{pad_left + chart_w}" y2="{pad_top + chart_h}" stroke="#3a3a3c" stroke-width="1"/>
    <path d="{fill_path}" fill="url(#grad_{chart_id})"/>
    <path d="{path}" fill="none" stroke="{color}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
    {warn_svg}{hover_svg}
    <g id="tooltip_{chart_id}" visibility="hidden" pointer-events="none">
        <line id="tt_line_{chart_id}" x1="0" y1="{pad_top}" x2="0" y2="{pad_top + chart_h}" stroke="#8e8e93" stroke-width="1" stroke-dasharray="3"/>
        <rect id="tt_bg_{chart_id}" x="0" y="0" width="130" height="38" rx="10" fill="#2c2c2e" stroke="#48484a"/>
        <text id="tt_val_{chart_id}" x="0" y="0" fill="#fff" font-size="14" font-weight="700" text-anchor="middle"></text>
        <text id="tt_time_{chart_id}" x="0" y="0" fill="#8e8e93" font-size="10" text-anchor="middle"></text>
    </g></svg>'''


CSS = """\
:root{--bg:#000;--card:#1c1c1e;--border:#2c2c2e;--green:#34c759;--yellow:#ff9f0a;--red:#ff3b30;--orange:#ff6723;--blue:#0a84ff;--text:#f5f5f7;--sec:#98989d;--ter:#636366}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'SF Pro Display','SF Pro Text','Helvetica Neue',system-ui,sans-serif;background:var(--bg);color:var(--text);line-height:1.47;-webkit-font-smoothing:antialiased}
.hero{padding:48px 24px 32px;text-align:center;background:linear-gradient(180deg,#0a0a1a 0%,var(--bg) 100%)}
.hero h1{font-size:2.2em;font-weight:700;letter-spacing:-.02em}
.hero .sub{color:var(--sec);font-size:.85em;margin-top:6px}
.device-strip{display:flex;justify-content:center;gap:24px;margin-top:18px;flex-wrap:wrap}
.device-strip .item{text-align:center}
.device-strip .val{font-size:1em;font-weight:600}
.device-strip .lbl{font-size:.65em;color:var(--sec);text-transform:uppercase;letter-spacing:.6px;margin-top:2px}
.wrap{max-width:1080px;margin:0 auto;padding:0 16px 48px}
.kpi-row{display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin-bottom:14px}
.kpi{background:var(--card);border:1px solid var(--border);border-radius:14px;padding:16px;text-align:center}
.kpi .val{font-size:1.8em;font-weight:700;letter-spacing:-.02em;line-height:1}
.kpi .lbl{font-size:.65em;color:var(--sec);text-transform:uppercase;letter-spacing:.5px;margin-top:4px}
.card-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:10px}
.card{background:var(--card);border:1px solid var(--border);border-radius:14px;padding:20px;overflow:hidden}
.card.full{grid-column:1/-1}
.card-title{font-size:.7em;text-transform:uppercase;letter-spacing:.7px;color:var(--sec);margin-bottom:10px;font-weight:600}
.stat-big{font-size:2em;font-weight:700;letter-spacing:-.02em;line-height:1}
.stat-sub{font-size:.78em;color:var(--sec);margin-top:5px}
.stat-row{display:flex;justify-content:space-between;padding:5px 0;font-size:.82em;border-bottom:1px solid rgba(255,255,255,.03)}
.stat-row:last-child{border-bottom:none}
.stat-row .k{color:var(--sec)}
.stat-row .v{font-weight:600}
.bar{height:5px;background:rgba(255,255,255,.05);border-radius:3px;margin:8px 0;overflow:hidden}
.bar>div{height:100%;border-radius:3px}
table{width:100%;border-collapse:collapse;font-size:.82em}
th{text-align:left;font-size:.65em;color:var(--ter);text-transform:uppercase;letter-spacing:.5px;padding:5px 6px;border-bottom:1px solid var(--border);font-weight:600}
td{padding:7px 6px;border-bottom:1px solid rgba(255,255,255,.02)}
tr:last-child td{border-bottom:none}
.chart-svg{cursor:crosshair}
.chart-svg .axis-label{font-size:10px;fill:#636366;font-family:-apple-system,sans-serif}
.chart-svg .grid-line{stroke:#2c2c2e;stroke-width:.5}
.chart-svg .hover-point{cursor:pointer}
.chart-empty{height:100px;display:flex;align-items:center;justify-content:center;color:var(--ter);font-size:.85em}
.tip{cursor:help;color:var(--ter);font-size:.8em;margin-left:4px;position:relative}
.tip:hover::after{content:attr(data-tip);position:absolute;bottom:120%;left:50%;transform:translateX(-50%);background:#2c2c2e;color:var(--text);padding:6px 10px;border-radius:8px;font-size:.75em;white-space:nowrap;z-index:10;border:1px solid #48484a;line-height:1.4;pointer-events:none}
.footer{text-align:center;padding:32px 0;color:var(--ter);font-size:.72em;border-top:1px solid var(--border);margin-top:24px}
@media(max-width:768px){
.card-grid{grid-template-columns:1fr}
.kpi-row{grid-template-columns:repeat(3,1fr)}
.device-strip{gap:12px}
.hero{padding:32px 16px 20px}
.hero h1{font-size:1.6em}
.kpi .val{font-size:1.4em}
.stat-big{font-size:1.6em}
table{font-size:.78em}
}
@media(max-width:480px){
.kpi-row{grid-template-columns:repeat(2,1fr)}
.device-strip{gap:8px}
.device-strip .val{font-size:.9em}
}
"""

CHART_JS = """
document.addEventListener('DOMContentLoaded',function(){
document.querySelectorAll('.chart-svg').forEach(function(svg){
var cid=svg.id,tt=document.getElementById('tooltip_'+cid),tl=document.getElementById('tt_line_'+cid),tb=document.getElementById('tt_bg_'+cid),tv=document.getElementById('tt_val_'+cid),tt2=document.getElementById('tt_time_'+cid);
if(!tt)return;var pts=svg.querySelectorAll('.hover-point');
svg.addEventListener('mousemove',function(e){
var r=svg.getBoundingClientRect(),sw=svg.viewBox.baseVal.width,sx=sw/r.width,mx=(e.clientX-r.left)*sx;
var cl=null,md=1e9;pts.forEach(function(p){var cx=parseFloat(p.getAttribute('cx')),d=Math.abs(cx-mx);if(d<md){md=d;cl=p}});
if(cl&&md<60){var cx=parseFloat(cl.getAttribute('cx')),cy=parseFloat(cl.getAttribute('cy')),v=cl.getAttribute('data-val'),t=cl.getAttribute('data-time'),u=cl.getAttribute('data-unit');
tt.setAttribute('visibility','visible');tl.setAttribute('x1',cx);tl.setAttribute('x2',cx);
var bx=cx-65;if(bx<5)bx=5;if(bx>sw-140)bx=sw-140;
tb.setAttribute('x',bx);tb.setAttribute('y',cy-46);tv.setAttribute('x',bx+65);tv.setAttribute('y',cy-27);tv.textContent=v+u;
tt2.setAttribute('x',bx+65);tt2.setAttribute('y',cy-14);tt2.textContent=t}else{tt.setAttribute('visibility','hidden')}});
svg.addEventListener('mouseleave',function(){tt.setAttribute('visibility','hidden')});
svg.addEventListener('touchmove',function(e){e.preventDefault();var touch=e.touches[0];var r=svg.getBoundingClientRect(),sw=svg.viewBox.baseVal.width,sx=sw/r.width,mx=(touch.clientX-r.left)*sx;
var cl=null,md=1e9;pts.forEach(function(p){var cx=parseFloat(p.getAttribute('cx')),d=Math.abs(cx-mx);if(d<md){md=d;cl=p}});
if(cl&&md<80){var cx=parseFloat(cl.getAttribute('cx')),cy=parseFloat(cl.getAttribute('cy')),v=cl.getAttribute('data-val'),t=cl.getAttribute('data-time'),u=cl.getAttribute('data-unit');
tt.setAttribute('visibility','visible');tl.setAttribute('x1',cx);tl.setAttribute('x2',cx);
var bx=cx-65;if(bx<5)bx=5;if(bx>sw-140)bx=sw-140;
tb.setAttribute('x',bx);tb.setAttribute('y',cy-46);tv.setAttribute('x',bx+65);tv.setAttribute('y',cy-27);tv.textContent=v+u;
tt2.setAttribute('x',bx+65);tt2.setAttribute('y',cy-14);tt2.textContent=t}else{tt.setAttribute('visibility','hidden')}}},{passive:false});
svg.addEventListener('touchend',function(){tt.setAttribute('visibility','hidden')});
});
});
"""


def generate_report(data: dict) -> str:
    """Generate Apple HIG-inspired HTML report from extracted sysdiagnose data."""
    battery = data.get("battery", {})
    nand = data.get("nand_smart", {})
    crashes = data.get("crashes", {})
    writers = data.get("app_nand_writers", [])[:8]
    apps = data.get("app_screen_time", [])[:8]
    mem = data.get("app_memory", [])[:8]
    dev_cfg = data.get("device_config", {})
    trend = data.get("battery_trend", [])
    gps = data.get("gps_usage", [])[:8]
    net = data.get("network_usage", [])[:8]

    lang = detect_language(data)
    is_cn = lang == "zh"

    health_pct = battery.get("health_pct", 0) or 0
    nand_pct = nand.get("percent_used", 0) or 0
    nand_remain = 100 - nand_pct
    cycles = battery.get("cycle_count", 0) or 0
    power_hours = nand.get("power_on_hours", 0) or 0
    total_crashes = crashes.get("total", 0)
    hw_tb = (nand.get("host_writes_sectors", 0) or 0) * 512 / 1024**4
    hr_tb = (nand.get("host_reads_sectors", 0) or 0) * 512 / 1024**4
    nw_tb = (nand.get("nand_writes_sectors", 0) or 0) * 512 / 1024**4
    nr_tb = (nand.get("nand_reads_sectors", 0) or 0) * 512 / 1024**4

    generated_at = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    time_range = ""
    if trend:
        time_range = f'{fmt_datetime_full(trend[0]["ts"])} — {fmt_datetime_full(trend[-1]["ts"])}'

    soc = dev_cfg.get("soc", "")
    SOC_MAP = {"t8110": "A15 Bionic"}
    MODEL_MAP = {"t8110": "iPhone 13 Pro"}
    model = MODEL_MAP.get(soc, soc)
    soc_name = SOC_MAP.get(soc, soc)

    device_info = [
        ("型号" if is_cn else "Model", model),
        ("芯片" if is_cn else "SoC", f"{soc_name} ({soc})"),
        ("存储" if is_cn else "Storage", f'{dev_cfg.get("disk_size_gb", "?")} GB'),
        ("可用" if is_cn else "Free", f'{dev_cfg.get("free_space_gb", "?")} GB'),
    ]

    # KPI row
    h_c = health_color(health_pct)
    n_c = health_color(nand_remain)
    kpi_items = [
        (f"{health_pct}%", "电池健康" if is_cn else "Battery", h_c),
        (str(cycles), "充电循环" if is_cn else "Cycles", None),
        (f"{nand_remain}%", "闪存剩余" if is_cn else "NAND Left", n_c),
        (f"{power_hours // 24}天" if is_cn else f"{power_hours // 24}d", "运行" if is_cn else "Uptime", None),
        (str(total_crashes), "崩溃" if is_cn else "Crashes", "#ff3b30" if total_crashes > 50 else None),
    ]
    kpi_html = '<div class="kpi-row">'
    for val, lbl, color in kpi_items:
        style = f' style="color:{color}"' if color else ""
        kpi_html += f'<div class="kpi"><div class="val"{style}>{val}</div><div class="lbl">{lbl}</div></div>'
    kpi_html += '</div>'

    # Device strip
    device_strip = '<div class="device-strip">' + "".join(
        f'<div class="item"><div class="val">{v}</div><div class="lbl">{k}</div></div>'
        for k, v in device_info
    ) + '</div>'

    # Battery card
    bat_card = f'''<div class="card"><div class="card-title">{"电池详情" if is_cn else "Battery"}</div>
    <div class="stat-big" style="color:{h_c}">{health_pct}%</div>
    <div class="stat-sub">{battery.get("current_max_capacity_mah","?")} / {battery.get("design_capacity_mah","?")} mAh</div>
    <div class="bar"><div style="width:{health_pct}%;background:{h_c}"></div></div>
    <div style="margin-top:10px">
    <div class="stat-row"><span class="k">{"循环次数" if is_cn else "Cycles"}</span><span class="v">{cycles}</span></div>
    <div class="stat-row"><span class="k">{"设计容量" if is_cn else "Design"}</span><span class="v">{battery.get("design_capacity_mah","?")} mAh</span></div>
    <div class="stat-row"><span class="k">{"当前容量" if is_cn else "Current"}</span><span class="v">{battery.get("current_max_capacity_mah","?")} mAh</span></div>
    <div class="stat-row"><span class="k">{"温度" if is_cn else "Temp"}</span><span class="v">{battery.get("temperature_c","?")}°C</span></div>
    <div class="stat-row"><span class="k">{"电压" if is_cn else "Voltage"}</span><span class="v">{battery.get("voltage_mv","?")} mV</span></div>
    </div></div>'''

    # NAND card
    pe = nand.get("avg_tlc_pe_cycles", 0) or 0
    eol = nand.get("eol_cycles", 3000)
    pe_pct = round(pe / eol * 100, 1)
    nand_card = f'''<div class="card"><div class="card-title">{"闪存健康" if is_cn else "NAND Flash"}</div>
    <div class="stat-big" style="color:{n_c}">{nand_remain}%</div>
    <div class="stat-sub">{"剩余寿命" if is_cn else "Remaining"}</div>
    <div class="bar"><div style="width:{nand_remain}%;background:{n_c}"></div></div>
    <div style="margin-top:10px">
    <div class="stat-row"><span class="k">{"主机写入" if is_cn else "Host write"}</span><span class="v">{hw_tb:.1f} TB</span></div>
    <div class="stat-row"><span class="k">{"主机读取" if is_cn else "Host read"}</span><span class="v">{hr_tb:.1f} TB</span></div>
    <div class="stat-row"><span class="k">{"闪存写入" if is_cn else "NAND write"}</span><span class="v">{nw_tb:.1f} TB</span></div>
    <div class="stat-row"><span class="k">{"闪存读取" if is_cn else "NAND read"}</span><span class="v">{nr_tb:.1f} TB</span></div>
    <div class="stat-row"><span class="k">PE {"擦写" if is_cn else "cycles"}{tip("NAND闪存单元的擦除-编程次数，TLC颗粒典型寿命3000次" if is_cn else "Program-Erase cycles, TLC NAND typical lifespan 3000")}</span><span class="v">{pe} / {eol} ({pe_pct}%)</span></div>
    <div class="stat-row"><span class="k">{"坏块" if is_cn else "Bad"}{tip("NAND闪存中标记为不可用的存储块，出厂坏块属正常范围" if is_cn else "Blocks marked unusable, factory bad blocks are normal")}</span><span class="v">{nand.get("grown_bad_blocks",0)} {"增长" if is_cn else "grown"} / {nand.get("factory_bad_blocks",0)} {"出厂" if is_cn else "factory"}</span></div>
    <div class="stat-row"><span class="k">WAF{tip("写入放大系数，1.0=理想，>2表示闪存控制器开销较大" if is_cn else "Write Amplification Factor, 1.0=ideal, >2=high overhead")}</span><span class="v">{nand.get("write_amp","N/A")}</span></div>
    <div class="stat-row"><span class="k">{"运行时间" if is_cn else "Uptime"}</span><span class="v">{power_hours}h ({power_hours//24}{"天" if is_cn else "d"})</span></div>
    </div></div>'''

    # Battery chart
    bat_chart = ""
    if trend:
        svg = interactive_chart_svg(trend, "level", height=200, color="#34c759", unit="%", y_max=100, warn_line=20, chart_id="bat")
        bat_chart = f'<div class="card full"><div class="card-title">{"电量趋势" if is_cn else "Battery Trend"}</div>{svg}</div>'

    # Tables
    writer_rows = ""
    if writers:
        max_w = writers[0].get("logical_writes_bytes", 1) or 1
        for w in writers:
            wr = w.get("logical_writes_bytes", 0) or 0
            pct = wr / max_w * 100
            bc = "#ff3b30" if pct > 60 else "#ff6723" if pct > 30 else "#ff9f0a" if pct > 10 else "#636366"
            writer_rows += f'<tr><td>{short_name(w["bundle_id"])}</td><td style="font-weight:600">{fmt_bytes(wr)}</td><td style="width:30%"><div class="bar"><div style="width:{pct}%;background:{bc}"></div></div></td></tr>'

    app_rows = ""
    for a in apps:
        app_rows += f'<tr><td>{short_name(a["bundle_id"])}</td><td style="font-weight:600">{fmt_seconds(a["foreground_sec"])}</td><td style="color:var(--sec)">{fmt_seconds(a["background_sec"])}</td></tr>'

    mem_rows = ""
    for m in mem:
        mb = (m.get("peak_memory_kb", 0) or 0) / 1024 / 1024
        mem_rows += f'<tr><td>{short_name(m["bundle_id"])}</td><td>{mb:.0f} MB</td></tr>'

    gps_rows = ""
    for g in gps:
        gps_rows += f'<tr><td>{short_name(g["bundle_id"])}</td><td>{g["location_requests"]}</td></tr>'

    net_rows = ""
    for n_item in net:
        net_rows += f'<tr><td>{short_name(n_item["name"])}</td><td>{fmt_bytes(n_item["wifi_in_bytes"])}</td><td>{fmt_bytes(n_item["wifi_out_bytes"])}</td></tr>'

    na = "暂无数据" if is_cn else "N/A"
    app_lbl = "应用" if is_cn else "App"
    fg_lbl = "前台" if is_cn else "FG"
    bg_lbl = "后台" if is_cn else "BG"

    html = f'''<!DOCTYPE html>
<html lang="{"zh-CN" if is_cn else "en"}">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{"iPhone 诊断报告" if is_cn else "iPhone Diagnostics"}</title>
<style>{CSS}</style></head>
<body>
<div class="hero">
<h1>{"iPhone 诊断报告" if is_cn else "iPhone Diagnostics Report"}</h1>
<div class="sub">{time_range if time_range else generated_at}</div>
{device_strip}
</div>
<div class="wrap">
{kpi_html}
<div class="card-grid">{bat_card}{nand_card}</div>
<div class="card-grid" style="margin-top:10px">
{bat_chart}
</div>
<div class="card-grid" style="margin-top:10px">
<div class="card"><div class="card-title">{"存储写入排行" if is_cn else "NAND Writes"}</div>
<table><thead><tr><th>{app_lbl}</th><th>{"写入" if is_cn else "Writes"}</th><th></th></tr></thead><tbody>{writer_rows}</tbody></table></div>
<div class="card"><div class="card-title">{"亮屏时间" if is_cn else "Screen Time"}</div>
<table><thead><tr><th>{app_lbl}</th><th>{fg_lbl}</th><th>{bg_lbl}</th></tr></thead><tbody>{app_rows}</tbody></table></div>
</div>
<div class="card-grid" style="margin-top:10px">
<div class="card"><div class="card-title">{"内存峰值" if is_cn else "Peak Memory"}</div>
<table><thead><tr><th>{app_lbl}</th><th>{"峰值" if is_cn else "Peak"}</th></tr></thead><tbody>{mem_rows if mem_rows else f"<tr><td colspan=2 style=color:var(--ter)>{na}</td></tr>"}</tbody></table></div>
<div class="card"><div class="card-title">{"网络流量" if is_cn else "Network"}</div>
<table><thead><tr><th>{app_lbl}</th><th>↓</th><th>↑</th></tr></thead><tbody>{net_rows if net_rows else f"<tr><td colspan=3 style=color:var(--ter)>{na}</td></tr>"}</tbody></table></div>
</div>
<div class="footer">iPhone Sysdiagnose Analyzer · {generated_at}</div>
</div>
<script>{CHART_JS}</script>
</body></html>'''
    return html


def main():
    parser = argparse.ArgumentParser(description="Generate HTML report from extracted sysdiagnose data")
    parser.add_argument("input", help="JSON file from extract.py (or - for stdin)")
    parser.add_argument("-o", "--output", help="Output HTML file (default: stdout)")
    args = parser.parse_args()
    if args.input == "-":
        data = json.load(sys.stdin)
    else:
        with open(args.input) as f:
            data = json.load(f)
    html = generate_report(data)
    if args.output:
        with open(args.output, "w") as f:
            f.write(html)
        print(f"Report written to {args.output}", file=sys.stderr)
    else:
        print(html)


if __name__ == "__main__":
    main()
