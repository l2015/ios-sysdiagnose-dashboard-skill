"""
iPhone Sysdiagnose Report Generator
Apple HIG-inspired design with i18n, interactive charts, and correct data display.
Version: see VERSION constant.
"""
import argparse
import json
import sys
from datetime import datetime, timezone

VERSION = "0.1.4"


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
    if not bundle_id:
        return "未知"
    if bundle_id in APP_NAMES:
        return APP_NAMES[bundle_id]
    # Fallback: last segment, truncated
    parts = bundle_id.split(".")
    return parts[-1][:16] if parts else bundle_id


def detect_language(data: dict) -> str:
    all_bundles = set()
    for key in ["app_screen_time", "app_nand_writers", "app_memory", "app_energy", "app_cpu"]:
        for item in data.get(key, []):
            bid = item.get("bundle_id", "") or item.get("name", "")
            if bid:
                all_bundles.add(bid)
    cn = {"com.taobao", "com.tencent", "com.ss.iphone", "com.xingin",
          "com.xunmeng", "com.alipay", "com.sina", "com.netease",
          "com.zhihu", "com.duowan", "tv.danmaku", "com.gotokeep",
          "com.bilibili", "com.meituan"}
    for bundle in all_bundles:
        for prefix in cn:
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


def interactive_chart_svg(points: list[dict], value_key: str,
                           width: int = 1000, height: int = 200,
                           color: str = "#34c759", unit: str = "%",
                           y_max: float | None = None,
                           warn_line: float | None = None,
                           chart_id: str = "chart") -> str:
    if len(points) < 2:
        return '<div class="chart-empty">数据不足</div>'

    pl, pr_, pt, pb = 52, 20, 16, 42
    cw = width - pl - pr_
    ch = height - pt - pb
    t0, t1 = points[0]["ts"], points[-1]["ts"]
    tr = t1 - t0 if t1 != t0 else 1
    values = [p.get(value_key, 0) or 0 for p in points]
    max_val = y_max if y_max is not None else (max(values, default=1) or 1)

    def tx(ts):
        return pl + (ts - t0) / tr * cw
    def ty(val):
        return pt + ch - val / max_val * ch

    path_parts = []
    for i, p in enumerate(points):
        path_parts.append(f"{'M' if i == 0 else 'L'}{tx(p['ts']):.1f},{ty(p.get(value_key, 0) or 0):.1f}")
    path = " ".join(path_parts)
    fill = f"{path} L{tx(points[-1]['ts']):.1f},{pt + ch} L{tx(points[0]['ts']):.1f},{pt + ch} Z"

    time_svg = ""
    for i in range(7):
        f = i / 6
        x = pl + f * cw
        ts = t0 + f * tr
        time_svg += f'<text x="{x:.0f}" y="{pt + ch + 18}" text-anchor="middle" class="axis-label">{fmt_datetime(ts)}</text>'
        time_svg += f'<line x1="{x:.0f}" y1="{pt}" x2="{x:.0f}" y2="{pt + ch}" class="grid-line"/>'

    y_svg = ""
    for i in range(5):
        f = i / 4
        val = f * max_val
        y = ty(val)
        y_svg += f'<text x="{pl - 8}" y="{y + 4}" text-anchor="end" class="axis-label">{val:.0f}{unit}</text>'
        if i > 0:
            y_svg += f'<line x1="{pl}" y1="{y:.1f}" x2="{pl + cw}" y2="{y:.1f}" class="grid-line"/>'

    warn_svg = ""
    if warn_line is not None:
        wy = ty(warn_line)
        warn_svg = f'<line x1="{pl}" y1="{wy:.1f}" x2="{pl + cw}" y2="{wy:.1f}" stroke="#ff3b30" stroke-width="1" stroke-dasharray="6,3" opacity=".5"/><text x="{pl + cw - 4}" y="{wy - 6}" fill="#ff3b30" font-size="11" text-anchor="end" font-weight="600">{int(warn_line)}{unit}</text>'

    hover = ""
    for p in points:
        x, y = tx(p["ts"]), ty(p.get(value_key, 0) or 0)
        val = p.get(value_key, 0) or 0
        ts_str = fmt_datetime_full(p["ts"])
        hover += f'<circle cx="{x:.1f}" cy="{y:.1f}" r="8" fill="transparent" class="hover-point" data-val="{val:.1f}" data-time="{ts_str}" data-unit="{unit}"/>'

    return f'''<svg viewBox="0 0 {width} {height}" style="width:100%;height:{height}px" xmlns="http://www.w3.org/2000/svg" class="chart-svg" id="{chart_id}">
    <defs><linearGradient id="g_{chart_id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="{color}" stop-opacity=".12"/><stop offset="100%" stop-color="{color}" stop-opacity="0"/></linearGradient></defs>
    {time_svg}{y_svg}
    <line x1="{pl}" y1="{pt}" x2="{pl}" y2="{pt + ch}" stroke="#3a3a3c" stroke-width="1"/>
    <line x1="{pl}" y1="{pt + ch}" x2="{pl + cw}" y2="{pt + ch}" stroke="#3a3a3c" stroke-width="1"/>
    <path d="{fill}" fill="url(#g_{chart_id})"/>
    <path d="{path}" fill="none" stroke="{color}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
    {warn_svg}{hover}
    <g id="tt_{chart_id}" class="chart-tooltip" visibility="hidden" pointer-events="none">
        <line id="ttl_{chart_id}" x1="0" y1="{pt}" x2="0" y2="{pt + ch}" stroke="#8e8e93" stroke-width="1" stroke-dasharray="3"/>
        <rect id="ttb_{chart_id}" x="0" y="0" width="140" height="40" rx="10" fill="#2c2c2e" stroke="#48484a"/>
        <text id="ttv_{chart_id}" x="0" y="0" fill="#fff" font-size="15" font-weight="700" text-anchor="middle"></text>
        <text id="ttt_{chart_id}" x="0" y="0" fill="#8e8e93" font-size="11" text-anchor="middle"></text>
    </g></svg>'''


CSS = """\
:root{--bg:#000;--card:#1c1c1e;--border:#2c2c2e;--green:#34c759;--yellow:#ff9f0a;--red:#ff3b30;--orange:#ff6723;--blue:#0a84ff;--text:#f5f5f7;--sec:#98989d;--ter:#636366}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'SF Pro Display','SF Pro Text','Helvetica Neue',system-ui,sans-serif;background:var(--bg);color:var(--text);font-size:15px;line-height:1.5;-webkit-font-smoothing:antialiased}

.hero{padding:48px 24px 28px;text-align:center;background:linear-gradient(180deg,#0a0a1a 0%,var(--bg) 100%)}
.hero h1{font-size:2em;font-weight:700;letter-spacing:-.02em}
.hero .sub{color:var(--sec);font-size:.82em;margin-top:6px}
.hero .meta{color:var(--ter);font-size:.72em;margin-top:10px;line-height:1.6}
.device-strip{display:flex;justify-content:center;gap:24px;margin-top:16px;flex-wrap:wrap}
.device-strip .item{text-align:center}
.device-strip .val{font-size:.95em;font-weight:600}
.device-strip .lbl{font-size:.62em;color:var(--sec);text-transform:uppercase;letter-spacing:.6px;margin-top:2px}

.wrap{max-width:1080px;margin:0 auto;padding:0 16px 48px}
.kpi-row{display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin-bottom:14px}
.kpi{background:var(--card);border:1px solid var(--border);border-radius:14px;padding:16px;text-align:center}
.kpi .val{font-size:1.7em;font-weight:700;letter-spacing:-.02em;line-height:1}
.kpi .lbl{font-size:.62em;color:var(--sec);text-transform:uppercase;letter-spacing:.5px;margin-top:4px}

.card-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:10px}
.card{background:var(--card);border:1px solid var(--border);border-radius:14px;padding:20px;overflow:hidden;display:flex;flex-direction:column}
.card.full{grid-column:1/-1}
.card-title{font-size:.68em;text-transform:uppercase;letter-spacing:.7px;color:var(--sec);margin-bottom:10px;font-weight:600}
.stat-big{font-size:1.9em;font-weight:700;letter-spacing:-.02em;line-height:1}
.stat-sub{font-size:.75em;color:var(--sec);margin-top:5px}
.stat-row{display:flex;justify-content:space-between;align-items:center;padding:7px 0;font-size:.8em;border-bottom:1px solid rgba(255,255,255,.03)}
.stat-row:last-child{border-bottom:none}
.stat-row .k{color:var(--sec);display:flex;align-items:center;gap:4px}
.stat-row .v{font-weight:600}
.bar{height:5px;background:rgba(255,255,255,.05);border-radius:3px;margin:8px 0;overflow:hidden}
.bar>div{height:100%;border-radius:3px}

table{width:100%;border-collapse:collapse;font-size:.8em}
th{text-align:left;font-size:.62em;color:var(--ter);text-transform:uppercase;letter-spacing:.5px;padding:5px 6px;border-bottom:1px solid var(--border);font-weight:600}
td{padding:7px 6px;border-bottom:1px solid rgba(255,255,255,.02)}
tr:last-child td{border-bottom:none}

/* Tooltip (JS-driven, works on mobile) */
.tip{cursor:help;color:var(--ter);font-size:.75em;margin-left:3px;display:inline-flex;align-items:center;justify-content:center;width:16px;height:16px;border-radius:50%;border:1px solid var(--ter);font-style:normal;font-weight:600;line-height:1}
.tip-popup{position:fixed;background:#2c2c2e;color:var(--text);padding:10px 14px;border-radius:10px;font-size:.75em;line-height:1.5;max-width:260px;z-index:1000;border:1px solid #48484a;box-shadow:0 8px 24px rgba(0,0,0,.5);pointer-events:none}

/* Chart */
.chart-svg{cursor:crosshair;display:block}
.chart-svg .axis-label{font-size:10px;fill:#636366;font-family:-apple-system,sans-serif}
.chart-svg .grid-line{stroke:#2c2c2e;stroke-width:.5}
.chart-svg .hover-point{cursor:pointer}
.chart-tooltip rect{filter:drop-shadow(0 2px 8px rgba(0,0,0,.4))}
.chart-empty{height:100px;display:flex;align-items:center;justify-content:center;color:var(--ter);font-size:.82em}

.footer{text-align:center;padding:32px 0;color:var(--ter);font-size:.7em;border-top:1px solid var(--border);margin-top:24px}

@media(max-width:768px){
.card-grid{grid-template-columns:1fr}
.kpi-row{grid-template-columns:repeat(3,1fr)}
.device-strip{gap:12px}
.hero{padding:32px 16px 20px}
.hero h1{font-size:1.5em}
.kpi .val{font-size:1.3em}
.stat-big{font-size:1.5em}
}
@media(max-width:480px){
.kpi-row{grid-template-columns:repeat(2,1fr)}
.device-strip{gap:8px}
}
"""

CHART_JS = """
(function(){
var _popup=null;
function showTip(el,text){
  if(!_popup){_popup=document.createElement('div');_popup.className='tip-popup';document.body.appendChild(_popup)}
  _popup.textContent=text;_popup.style.display='block';
  var r=el.getBoundingClientRect();
  _popup.style.left=Math.max(8,Math.min(window.innerWidth-280,r.left+r.width/2-130))+'px';
  _popup.style.top=(r.top-8)+'px';
  _popup.style.transform='translateY(-100%)';
}
function hideTip(){if(_popup)_popup.style.display='none'}
document.querySelectorAll('.tip').forEach(function(el){
  var text=el.getAttribute('data-tip');
  el.addEventListener('mouseenter',function(){showTip(el,text)});
  el.addEventListener('mouseleave',hideTip);
  el.addEventListener('touchstart',function(e){e.preventDefault();showTip(el,text);setTimeout(hideTip,3000)},{passive:false});
});

function initChart(svg){
  var cid=svg.id;
  var tt=document.getElementById('tt_'+cid);
  var tl=document.getElementById('ttl_'+cid);
  var tb=document.getElementById('ttb_'+cid);
  var tv=document.getElementById('ttv_'+cid);
  var tt2=document.getElementById('ttt_'+cid);
  if(!tt)return;
  var pts=svg.querySelectorAll('.hover-point');
  function handleMove(mx){
    var r=svg.getBoundingClientRect(),sw=svg.viewBox.baseVal.width,sx=sw/r.width;
    var cl=null,md=1e9;
    pts.forEach(function(p){var cx=parseFloat(p.getAttribute('cx')),d=Math.abs(cx-mx);if(d<md){md=d;cl=p}});
    if(cl&&md<80){
      var cx=parseFloat(cl.getAttribute('cx')),cy=parseFloat(cl.getAttribute('cy'));
      var v=cl.getAttribute('data-val'),t=cl.getAttribute('data-time'),u=cl.getAttribute('data-unit');
      tt.setAttribute('visibility','visible');
      tl.setAttribute('x1',cx);tl.setAttribute('x2',cx);
      var bx=cx-70;if(bx<5)bx=5;if(bx>sw-150)bx=sw-150;
      tb.setAttribute('x',bx);tb.setAttribute('y',cy-50);
      tv.setAttribute('x',bx+70);tv.setAttribute('y',cy-28);tv.textContent=v+u;
      tt2.setAttribute('x',bx+70);tt2.setAttribute('y',cy-13);tt2.textContent=t;
    } else { tt.setAttribute('visibility','hidden'); }
  }
  svg.addEventListener('mousemove',function(e){var r=svg.getBoundingClientRect(),sw=svg.viewBox.baseVal.width;handleMove((e.clientX-r.left)*sw/r.width)});
  svg.addEventListener('mouseleave',function(){tt.setAttribute('visibility','hidden')});
  svg.addEventListener('touchmove',function(e){e.preventDefault();var touch=e.touches[0];var r=svg.getBoundingClientRect(),sw=svg.viewBox.baseVal.width;handleMove((touch.clientX-r.left)*sw/r.width)},{passive:false});
  svg.addEventListener('touchend',function(){setTimeout(function(){tt.setAttribute('visibility','hidden')},1500)});
}
document.querySelectorAll('.chart-svg').forEach(initChart);
})();
"""


def generate_report(data: dict) -> str:
    battery = data.get("battery", {})
    nand = data.get("nand_smart", {})
    crashes = data.get("crashes", {})
    app_exits = data.get("app_exits", [])
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
    total_boots = nand.get("total_boots", 0) or 0
    total_crashes = crashes.get("total", 0)
    hw_tb = (nand.get("host_writes_sectors", 0) or 0) * 512 / 1024**4
    hr_tb = (nand.get("host_reads_sectors", 0) or 0) * 512 / 1024**4
    nw_tb = (nand.get("nand_writes_sectors", 0) or 0) * 512 / 1024**4
    nr_tb = (nand.get("nand_reads_sectors", 0) or 0) * 512 / 1024**4

    generated_at = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    log_range = ""
    if trend:
        log_range = f'{fmt_datetime_full(trend[0]["ts"])} — {fmt_datetime_full(trend[-1]["ts"])}'

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

    # Meta info below title
    meta_lines = [
        f"日志记录: {log_range}" if is_cn else f"Log range: {log_range}",
        f"报告生成: {generated_at}" if is_cn else f"Report generated: {generated_at}",
        f"分析器版本: {VERSION}",
    ]
    meta_html = '<div class="meta">' + "<br>".join(meta_lines) + '</div>'

    # KPI
    h_c = health_color(health_pct)
    n_c = health_color(nand_remain)
    kpi_items = [
        (f"{health_pct}%", "电池健康" if is_cn else "Battery", h_c),
        (str(cycles), "充电循环" if is_cn else "Cycles", None),
        (f"{nand_remain}%", "闪存剩余" if is_cn else "NAND Left", n_c),
        (f"{total_crashes}", "日志崩溃" if is_cn else "Crashes", "#ff3b30" if total_crashes > 20 else None),
        (f"{len(app_exits)}项", "应用退出" if is_cn else "App Exits", None),
    ]
    kpi_html = '<div class="kpi-row">'
    for val, lbl, color in kpi_items:
        style = f' style="color:{color}"' if color else ""
        kpi_html += f'<div class="kpi"><div class="val"{style}>{val}</div><div class="lbl">{lbl}</div></div>'
    kpi_html += '</div>'

    device_strip = '<div class="device-strip">' + "".join(
        f'<div class="item"><div class="val">{v}</div><div class="lbl">{k}</div></div>'
        for k, v in device_info
    ) + '</div>'

    # Tip helper
    def T(text):
        return f'<i class="tip" data-tip="{text}">?</i>'

    # Battery card - matched row count with NAND
    bat_card = f'''<div class="card"><div class="card-title">{"电池详情" if is_cn else "Battery"}</div>
    <div class="stat-big" style="color:{h_c}">{health_pct}%</div>
    <div class="stat-sub">{battery.get("current_max_capacity_mah","?")} / {battery.get("design_capacity_mah","?")} mAh</div>
    <div class="bar"><div style="width:{health_pct}%;background:{h_c}"></div></div>
    <div style="margin-top:8px">
    <div class="stat-row"><span class="k">{"循环次数" if is_cn else "Cycles"}</span><span class="v">{cycles}</span></div>
    <div class="stat-row"><span class="k">{"设计容量" if is_cn else "Design"}</span><span class="v">{battery.get("design_capacity_mah","?")} mAh</span></div>
    <div class="stat-row"><span class="k">{"当前容量" if is_cn else "Current"}</span><span class="v">{battery.get("current_max_capacity_mah","?")} mAh</span></div>
    <div class="stat-row"><span class="k">{"容量损耗" if is_cn else "Degraded"}</span><span class="v">{(battery.get("design_capacity_mah",0) or 0) - (battery.get("current_max_capacity_mah",0) or 0)} mAh ({100-health_pct:.1f}%)</span></div>
    <div class="stat-row"><span class="k">{"温度" if is_cn else "Temp"}</span><span class="v">{battery.get("temperature_c","?")}°C</span></div>
    <div class="stat-row"><span class="k">{"电压" if is_cn else "Voltage"}</span><span class="v">{battery.get("voltage_mv","?")} mV</span></div>
    <div class="stat-row"><span class="k">{"标称容量" if is_cn else "Nominal"}</span><span class="v">{battery.get("nominal_capacity_mah","N/A")} mAh</span></div>
    </div></div>'''

    # NAND card
    pe = nand.get("avg_tlc_pe_cycles", 0) or 0
    eol = nand.get("eol_cycles", 3000)
    pe_pct = round(pe / eol * 100, 1)
    nand_card = f'''<div class="card"><div class="card-title">{"闪存健康" if is_cn else "NAND Flash"}</div>
    <div class="stat-big" style="color:{n_c}">{nand_remain}%</div>
    <div class="stat-sub">{"剩余寿命" if is_cn else "Remaining"}</div>
    <div class="bar"><div style="width:{nand_remain}%;background:{n_c}"></div></div>
    <div style="margin-top:8px">
    <div class="stat-row"><span class="k">{"主机写入" if is_cn else "Host write"}{T("iOS系统请求写入的数据量。你保存照片、安装App等操作都算在这里" if is_cn else "Data written as requested by iOS (photos, app installs, etc.)")}</span><span class="v">{hw_tb:.1f} TB</span></div>
    <div class="stat-row"><span class="k">{"主机读取" if is_cn else "Host read"}{T("iOS系统请求读取的数据量" if is_cn else "Data read as requested by iOS")}</span><span class="v">{hr_tb:.1f} TB</span></div>
    <div class="stat-row"><span class="k">{"闪存写入" if is_cn else "NAND write"}{T("闪存芯片实际写入的物理数据量，因垃圾回收和磨损均衡机制，通常大于主机写入量" if is_cn else "Physical data written to NAND chips, typically exceeds host writes due to garbage collection")}</span><span class="v">{nw_tb:.1f} TB</span></div>
    <div class="stat-row"><span class="k">{"闪存读取" if is_cn else "NAND read"}{T("闪存芯片实际读取的物理数据量" if is_cn else "Physical data read from NAND chips")}</span><span class="v">{nr_tb:.1f} TB</span></div>
    <div class="stat-row"><span class="k">PE {"擦写" if is_cn else ""}{T("闪存每个存储单元可擦除重新写入的次数。TLC闪存典型寿命约3000次，到达后该单元可能失效。当前已用" + str(pe_pct) + "%，剩余" + str(round((1-pe_pct/100)*eol)) + "次" if is_cn else "Program-Erase cycles per NAND cell. TLC typical lifespan ~3000. Currently " + str(pe_pct) + "% used")}</span><span class="v">{pe} / {eol} ({pe_pct}%)</span></div>
    <div class="stat-row"><span class="k">{"坏块" if is_cn else "Bad"}{T("NAND中标记为不可用的存储块。出厂坏块是生产时检测到的缺陷，属于正常范围。增长坏块是在使用中新增的，表示闪存老化" if is_cn else "Blocks marked unusable. Factory defects are normal. Grown bad blocks indicate aging")}</span><span class="v">{nand.get("grown_bad_blocks",0)} {"增长" if is_cn else "grown"} / {nand.get("factory_bad_blocks",0)} {"出厂" if is_cn else "factory"}</span></div>
    <div class="stat-row"><span class="k">WAF{T("写入放大系数 = 闪存实际写入量 ÷ 主机写入量。因为闪存必须先擦除整个块才能写入新数据（就像擦黑笔字要整面擦），所以实际写入量总是大于你请求的量。1.0=完美无浪费，当前" + str(nand.get("write_amp","?")) + "意味着每写1TB数据闪存实际写" + str(nand.get("write_amp","?")) + "TB" if is_cn else "Write Amplification = NAND writes / host writes. Flash must erase whole blocks before writing (like erasing a whole page to fix one word). 1.0=perfect, current " + str(nand.get("write_amp","?")))}</span><span class="v">{nand.get("write_amp","N/A")}</span></div>
    <div class="stat-row"><span class="k">{"累计通电" if is_cn else "Cumulative on"}{T("自上次抹掉所有内容后，设备的累计通电时间（关机期间不计入）和总开机次数。" + str(power_hours//24) + "天是累计值，不是连续不关机" if is_cn else "Cumulative powered-on time since last erase, and total boot count. " + str(power_hours//24) + "d is cumulative, not continuous")}</span><span class="v">{power_hours}h ({power_hours//24}天) / {total_boots}{"次开机" if is_cn else " boots"}</span></div>
    </div></div>'''

    # Battery chart
    bat_chart = ""
    if trend:
        span_h = (trend[-1]["ts"] - trend[0]["ts"]) / 3600
        span_label = f'（{"约" if is_cn else "~"}{span_h:.0f}{"小时" if is_cn else "h"} {"日志" if is_cn else "log"}）'
        svg = interactive_chart_svg(trend, "level", height=200, color="#34c759", unit="%", y_max=100, warn_line=20, chart_id="bat")
        bat_chart = f'<div class="card full"><div class="card-title">{"电量趋势" if is_cn else "Battery Trend"} {span_label}</div>{svg}</div>'

    # Tables
    writer_rows = ""
    if writers:
        max_w = writers[0].get("logical_writes_bytes", 1) or 1
        for w in writers:
            wr = w.get("logical_writes_bytes", 0) or 0
            pct = wr / max_w * 100
            bc = "#ff3b30" if pct > 60 else "#ff6723" if pct > 30 else "#ff9f0a" if pct > 10 else "#636366"
            writer_rows += f'<tr><td>{short_name(w["bundle_id"])}</td><td style="font-weight:600">{fmt_bytes(wr)}</td><td style="width:28%"><div class="bar"><div style="width:{pct}%;background:{bc}"></div></div></td></tr>'

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
    al = "应用" if is_cn else "App"
    fg_lbl = "前台" if is_cn else "FG"
    bg_lbl = "后台" if is_cn else "BG"

    # Crash analysis
    jetsam = crashes.get("jetsam", 0)
    safari_crashes = crashes.get("safari", 0)
    disk_w = crashes.get("disk_writes", 0)
    cpu_r = crashes.get("cpu_resource", 0)
    sfa = crashes.get("sfa", 0)
    crash_details = crashes.get("details", [])
    crash_detail_str = ""
    if crash_details:
        crash_detail_str = "".join(f'<div class="stat-row"><span class="k">{d["app"]}</span><span class="v">{"磁盘写入超限" if is_cn else "Disk write exceed"}</span></div>' for d in crash_details if d.get("app"))

    crash_card = f'''<div class="card"><div class="card-title">{"崩溃分析（日志文件）" if is_cn else "Crash Analysis (Log Files)"}</div>
    <div class="stat-big" style="color:{"#ff3b30" if total_crashes > 20 else "#ff9f0a" if total_crashes > 5 else "var(--sec)"}">{total_crashes}</div>
    <div class="stat-sub">{"48小时内" if is_cn else "In 48h"}</div>
    <div style="margin-top:8px">
    <div class="stat-row"><span class="k">Jetsam {"内存回收" if is_cn else "memory kill"}</span><span class="v" style="color:{"#ff3b30" if jetsam > 10 else "inherit"}">{jetsam}</span></div>
    <div class="stat-row"><span class="k">Safari {"崩溃" if is_cn else "crash"}</span><span class="v">{safari_crashes}</span></div>
    <div class="stat-row"><span class="k">{"磁盘写入超限" if is_cn else "Disk write exceed"}</span><span class="v">{disk_w}</span></div>
    <div class="stat-row"><span class="k">CPU {"超限" if is_cn else "resource"}</span><span class="v">{cpu_r}</span></div>
    <div class="stat-row"><span class="k">SFA {"安全事件" if is_cn else "security"}</span><span class="v">{sfa}</span></div>
    <div class="stat-row"><span class="k">{"其他" if is_cn else "Other"}</span><span class="v">{crashes.get("other", 0)}</span></div>
    {crash_detail_str}
    </div></div>'''

    # App exits (Jetsam kills by app)
    app_exit_card = ""
    jetsam_exits = [e for e in app_exits if e.get("reason_code") == 1][:8]
    if jetsam_exits:
        rows = ""
        for e in jetsam_exits:
            rows += f'<tr><td>{short_name(e["bundle_id"])}</td><td style="font-weight:600;color:#ff9f0a">{e["count"]}</td></tr>'
        app_exit_card = f'''<div class="card"><div class="card-title">{"Jetsam 内存回收排行" if is_cn else "Jetsam Memory Kills"}</div>
        <div class="stat-sub" style="margin-bottom:8px">{"系统因内存不足强制回收的次数（累计）" if is_cn else "Times system killed app to reclaim memory (cumulative)"}</div>
        <table><thead><tr><th>{al}</th><th>{"次数" if is_cn else "Count"}</th></tr></thead><tbody>{rows}</tbody></table></div>'''


    html = f'''<!DOCTYPE html>
<html lang="{"zh-CN" if is_cn else "en"}">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{"iPhone 诊断报告" if is_cn else "iPhone Diagnostics"}</title>
<style>{CSS}</style></head>
<body>
<div class="hero">
<h1>{"iPhone 诊断报告" if is_cn else "iPhone Diagnostics Report"}</h1>
{meta_html}
{device_strip}
</div>
<div class="wrap">
{kpi_html}
<div class="card-grid">{bat_card}{nand_card}</div>
<div class="card-grid" style="margin-top:10px">{bat_chart}</div>
<div class="card-grid" style="margin-top:10px">
{crash_card}
{app_exit_card if app_exit_card else '<div class="card"><div class="card-title">' + ("Jetsam 内存回收" if is_cn else "Jetsam Kills") + '</div><div class="stat-sub">' + na + '</div></div>'}
</div>
<div class="card-grid" style="margin-top:10px">
<div class="card"><div class="card-title">{"存储写入排行（累计）" if is_cn else "NAND Writes (Cumulative)"}</div>
<table><thead><tr><th>{al}</th><th>{"写入" if is_cn else "Writes"}</th><th></th></tr></thead><tbody>{writer_rows}</tbody></table></div>
<div class="card"><div class="card-title">{"亮屏时间（累计）" if is_cn else "Screen Time (Cumulative)"}</div>
<table><thead><tr><th>{al}</th><th>{"前台" if is_cn else "FG"}</th><th>{"后台" if is_cn else "BG"}</th></tr></thead><tbody>{app_rows}</tbody></table></div>
</div>
<div class="card-grid" style="margin-top:10px">
<div class="card"><div class="card-title">{"内存峰值" if is_cn else "Peak Memory"}</div>
<table><thead><tr><th>{al}</th><th>{"峰值" if is_cn else "Peak"}</th></tr></thead><tbody>{mem_rows if mem_rows else f"<tr><td colspan=2 style=color:var(--ter)>{na}</td></tr>"}</tbody></table></div>
<div class="card"><div class="card-title">{"网络流量（累计）" if is_cn else "Network (Cumulative)"}</div>
<table><thead><tr><th>{al}</th><th>↓</th><th>↑</th></tr></thead><tbody>{net_rows if net_rows else f"<tr><td colspan=3 style=color:var(--ter)>{na}</td></tr>"}</tbody></table></div>
</div>
<div class="footer">iPhone Sysdiagnose Analyzer v{VERSION} · {generated_at}</div>
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
