"""
iPhone Sysdiagnose Data Extractor
Extracts structured data from sysdiagnose archives for analysis and reporting.
"""
import json
import os
import re
import sqlite3
import subprocess
import sys
from pathlib import Path


def find_powerlog(base_dir: str) -> str | None:
    """Locate the PowerLog .PLSQL database file."""
    pl_dir = os.path.join(base_dir, "logs", "powerlogs")
    if os.path.isdir(pl_dir):
        for f in os.listdir(pl_dir):
            if f.endswith(".PLSQL"):
                return os.path.join(pl_dir, f)
    return None


def parse_battery(conn: sqlite3.Connection) -> dict:
    """Extract battery health data from PowerLog."""
    cur = conn.cursor()
    result = {}

    try:
        cur.execute(
            "SELECT CycleCount, DesignCapacity, AppleRawMaxCapacity, Temperature, "
            "Voltage, NominalChargeCapacity, Level, MaxCapacity "
            "FROM PLBatteryAgent_EventBackward_Battery ORDER BY timestamp DESC LIMIT 1"
        )
        row = cur.fetchone()
        if row:
            result = {
                "cycle_count": row[0],
                "design_capacity_mah": row[1],
                "current_max_capacity_mah": row[2],
                "temperature_c": row[3],
                "voltage_mv": row[4],
                "nominal_capacity_mah": row[5],
                "level_pct": row[6],
                "health_pct": round(row[2] / row[1] * 100, 1) if row[1] and row[2] else None,
            }
    except sqlite3.OperationalError:
        pass

    try:
        cur.execute(
            "SELECT batteryServiceFlags, MaximumCapacityPercent, TotalOperatingTime "
            "FROM PLBatteryAgent_EventNone_BatteryConfig ORDER BY timestamp DESC LIMIT 1"
        )
        row = cur.fetchone()
        if row:
            result["service_flags"] = row[0]
            result["max_capacity_pct_reported"] = row[1]
            result["total_operating_hours"] = row[2]
    except sqlite3.OperationalError:
        pass

    return result


def parse_battery_trend(conn: sqlite3.Connection, max_points: int = 200) -> list[dict]:
    """Extract battery level time series for trend chart."""
    cur = conn.cursor()
    try:
        cur.execute(
            "SELECT timestamp, Level, Voltage, Temperature, IsCharging, Amperage "
            "FROM PLBatteryAgent_EventBackward_Battery ORDER BY timestamp"
        )
        rows = cur.fetchall()
        step = max(1, len(rows) // max_points)
        return [
            {
                "ts": r[0],
                "level": r[1],
                "voltage": r[2],
                "temp": r[3],
                "charging": bool(r[4]),
                "amperage": r[5],
            }
            for r in rows[::step]
        ]
    except sqlite3.OperationalError:
        return []


def parse_nand_smart(base_dir: str) -> dict:
    """Extract NAND flash SMART data from ASP snapshot log."""
    asp_log = os.path.join(base_dir, "ASPSnapshots", "asptool_snapshot.log")
    if not os.path.exists(asp_log):
        return {}

    try:
        result = subprocess.run(["strings", asp_log], capture_output=True, text=True, timeout=10)
        asp = result.stdout
    except (subprocess.TimeoutExpired, FileNotFoundError):
        return {}

    patterns = {
        "host_writes_sectors": r"hostWrites:\s*(\d+)",
        "host_reads_sectors": r"hostReads:\s*(\d+)",
        "nand_writes_sectors": r"nandWrites:\s*(\d+)",
        "nand_reads_sectors": r"nandReads:\s*(\d+)",
        "band_erases": r"bandErases:\s*(\d+)",
        "power_on_hours": r"powerOnHours:\s*(\d+)",
        "smart_crit_warnings": r"smartCritWarnings:\s*(\d+)",
        "factory_bad_blocks": r"numFactoryBad:\s*(\d+)",
        "grown_bad_blocks": r"numGrownBad:\s*(\d+)",
        "retired_blocks": r"numRetiredBlocks:\s*(\d+)",
        "percent_used": r"percentUsed:\s*(\d+)",
        "avg_tlc_pe_cycles": r"averageTLCPECycles:\s*(\d+)",
        "max_native_endurance": r"maxNativeEndurance:\s*(\d+)",
        "write_amp": r"WriteAmp:\s*([\d.]+)",
        "uecc_reads": r"ueccReads:\s*(\d+)",
        "num_pfail": r"numPfail:\s*(\d+)",
        "num_efail": r"numEfail:\s*(\d+)",
        "unclean_boots": r"uncleanBoots:\s*(\d+)",
        "total_boots": r"boots:\s*(\d+)",
    }

    data = {}
    for key, pattern in patterns.items():
        m = re.search(pattern, asp)
        if m:
            val = m.group(1)
            data[key] = float(val) if "." in val else int(val)

    m = re.search(r"EoL erase cycles.*?(\d+)", asp)
    if m:
        data["eol_cycles"] = int(m.group(1))

    return data


def parse_app_nand_writers(conn: sqlite3.Connection, limit: int = 25) -> list[dict]:
    """Rank apps by cumulative NAND logical writes."""
    cur = conn.cursor()
    try:
        cur.execute(
            "SELECT BundleId, SUM(LogicalWrites) as total "
            "FROM PLCoalitionAgent_Aggregate_NANDStats "
            "WHERE BundleId IS NOT NULL AND BundleId != '' "
            "GROUP BY BundleId ORDER BY total DESC LIMIT ?",
            (limit,),
        )
        return [{"bundle_id": r[0], "logical_writes_bytes": r[1]} for r in cur.fetchall()]
    except sqlite3.OperationalError:
        return []


def parse_app_screen_time(conn: sqlite3.Connection, limit: int = 25) -> list[dict]:
    """Rank apps by foreground/background screen time."""
    cur = conn.cursor()
    try:
        cur.execute(
            "SELECT BundleID, SUM(ScreenOnTime) as screen, SUM(BackgroundTime) as bg "
            "FROM PLAppTimeService_Aggregate_AppRunTime "
            "WHERE BundleID IS NOT NULL AND BundleID != '' "
            "GROUP BY BundleID ORDER BY screen DESC LIMIT ?",
            (limit,),
        )
        return [
            {"bundle_id": r[0], "foreground_sec": r[1] or 0, "background_sec": r[2] or 0}
            for r in cur.fetchall()
        ]
    except sqlite3.OperationalError:
        return []


def parse_app_energy(conn: sqlite3.Connection, limit: int = 25) -> list[dict]:
    """Rank apps by energy consumption."""
    cur = conn.cursor()
    try:
        cur.execute(
            "SELECT BundleID, SUM(Energy) as total_energy "
            "FROM PLDuetService_Aggregate_DuetEnergyAccumulator "
            "WHERE BundleID IS NOT NULL AND BundleID != '' "
            "GROUP BY BundleID ORDER BY total_energy DESC LIMIT ?",
            (limit,),
        )
        return [{"bundle_id": r[0], "energy_nj": r[1]} for r in cur.fetchall()]
    except sqlite3.OperationalError:
        return []


def parse_app_cpu(conn: sqlite3.Connection, limit: int = 20) -> list[dict]:
    """Rank apps by CPU time."""
    cur = conn.cursor()
    try:
        cur.execute(
            "SELECT LaunchdName, SUM(cpu_time) as cpu, SUM(bytesread) as br, SUM(byteswritten) as bw "
            "FROM PLCoalitionAgent_EventInterval_CoalitionInterval "
            "WHERE LaunchdName IS NOT NULL AND LaunchdName != '' "
            "GROUP BY LaunchdName ORDER BY cpu DESC LIMIT ?",
            (limit,),
        )
        return [
            {"name": r[0], "cpu_sec": r[1] or 0, "bytes_read": r[2] or 0, "bytes_written": r[3] or 0}
            for r in cur.fetchall()
        ]
    except sqlite3.OperationalError:
        return []


def parse_app_memory(conn: sqlite3.Connection, limit: int = 15) -> list[dict]:
    """Rank apps by peak memory usage."""
    cur = conn.cursor()
    try:
        cur.execute(
            "SELECT AppBundleId, MAX(PeakMemory) as peak "
            "FROM PLApplicationAgent_EventBackward_ApplicationMemory "
            "WHERE AppBundleId IS NOT NULL AND AppBundleId != '' "
            "GROUP BY AppBundleId ORDER BY peak DESC LIMIT ?",
            (limit,),
        )
        return [{"bundle_id": r[0], "peak_memory_kb": r[1] or 0} for r in cur.fetchall()]
    except sqlite3.OperationalError:
        return []


def parse_brightness_trend(conn: sqlite3.Connection, max_points: int = 150) -> list[dict]:
    """Extract screen brightness time series."""
    cur = conn.cursor()
    try:
        cur.execute("SELECT timestamp, Brightness FROM PLDisplayAgent_EventForward_Display ORDER BY timestamp")
        rows = cur.fetchall()
        step = max(1, len(rows) // max_points)
        return [{"ts": r[0], "brightness": r[1]} for r in rows[::step]]
    except sqlite3.OperationalError:
        return []


def parse_gps_usage(conn: sqlite3.Connection, limit: int = 15) -> list[dict]:
    """Rank apps by GPS usage."""
    cur = conn.cursor()
    try:
        cur.execute(
            "SELECT BundleId, COUNT(*) as uses "
            "FROM PLLocationAgent_EventForward_ClientStatus "
            "WHERE BundleId IS NOT NULL AND BundleId != '' AND InUseLevel > 0 "
            "GROUP BY BundleId ORDER BY uses DESC LIMIT ?",
            (limit,),
        )
        return [{"bundle_id": r[0], "location_requests": r[1]} for r in cur.fetchall()]
    except sqlite3.OperationalError:
        return []


def parse_network_usage(conn: sqlite3.Connection, limit: int = 15) -> list[dict]:
    """Rank processes by network traffic."""
    cur = conn.cursor()
    try:
        cur.execute(
            "SELECT BundleName, SUM(WifiIn) as wi, SUM(WifiOut) as wo "
            "FROM PLProcessNetworkAgent_EventInterval_UsageDiff "
            "WHERE BundleName IS NOT NULL AND BundleName != '' "
            "GROUP BY BundleName ORDER BY (IFNULL(wi,0)+IFNULL(wo,0)) DESC LIMIT ?",
            (limit,),
        )
        return [{"name": r[0], "wifi_in_bytes": r[1] or 0, "wifi_out_bytes": r[2] or 0} for r in cur.fetchall()]
    except sqlite3.OperationalError:
        return []


def parse_crashes(base_dir: str, parsed_dir: str | None = None) -> dict:
    """Categorize crash log entries from raw .ips files in crashes_and_spins/."""
    crash_dir = os.path.join(base_dir, "crashes_and_spins")
    counts = {"jetsam": 0, "safari": 0, "disk_writes": 0, "cpu_resource": 0, "sfa": 0, "other": 0, "details": []}
    total = 0

    # Parse raw .ips files directly (no SAF dependency)
    if os.path.isdir(crash_dir):
        for fname in sorted(os.listdir(crash_dir)):
            if not fname.endswith(".ips") or fname.startswith("._"):
                continue
            total += 1
            fname_lower = fname.lower()

            if "jetsam" in fname_lower:
                counts["jetsam"] += 1
            elif "safari" in fname_lower or "excuserfault_mobilesafari" in fname_lower:
                counts["safari"] += 1
            elif "diskwrites" in fname_lower or "disk_writes" in fname_lower:
                counts["disk_writes"] += 1
                # Extract app name from filename: "AppName.diskwrites_resource-..."
                app = fname.split(".")[0]
                counts["details"].append({"type": "disk_writes", "app": app, "file": fname})
            elif "cpu_resource" in fname_lower:
                counts["cpu_resource"] += 1
            elif fname.startswith("SFA-"):
                counts["sfa"] += 1
            else:
                counts["other"] += 1

    counts["total"] = total
    return counts


def parse_app_exits(conn: sqlite3.Connection, limit: int = 15) -> list[dict]:
    """Extract app exit reasons (crash/jetsam/watchdog)."""
    cur = conn.cursor()
    try:
        cur.execute(
            "SELECT Identifier, COUNT(*) as cnt, Reason "
            "FROM PLApplicationAgent_EventPoint_ApplicationExitReason "
            "WHERE Identifier IS NOT NULL AND Identifier != '' "
            "GROUP BY Identifier, Reason ORDER BY cnt DESC LIMIT ?",
            (limit,),
        )
        rows = cur.fetchall()
        reason_map = {0: "正常退出", 1: "Jetsam内存回收", 2: "看门狗超时", 3: "崩溃"}
        return [
            {
                "bundle_id": r[0],
                "count": r[1],
                "reason_code": r[2],
                "reason": reason_map.get(r[2], f"未知({r[2]})"),
            }
            for r in rows
        ]
    except sqlite3.OperationalError:
        return []


def parse_process_exits(conn: sqlite3.Connection, limit: int = 15) -> list[dict]:
    """Extract process exit events with memory pressure info."""
    cur = conn.cursor()
    try:
        cur.execute(
            "SELECT ProcessName, COUNT(*) as cnt, ReasonNamespace "
            "FROM PLProcessMonitorAgent_EventPoint_ProcessExit "
            "WHERE ProcessName IS NOT NULL AND ProcessName != '' "
            "GROUP BY ProcessName ORDER BY cnt DESC LIMIT ?",
            (limit,),
        )
        return [
            {"name": r[0], "count": r[1], "namespace": r[2]}
            for r in cur.fetchall()
        ]
    except sqlite3.OperationalError:
        return []


def parse_vpn_extensions(parsed_dir: str) -> list[dict]:
    """Extract VPN/network extension info."""
    ne_file = os.path.join(parsed_dir, "networkextension.json")
    if not os.path.exists(ne_file):
        return []

    try:
        with open(ne_file) as f:
            ne = json.load(f)
    except (json.JSONDecodeError, IOError):
        return []

    vpns = []
    for uuid, info in ne.items():
        if not isinstance(info, dict) or "Name" not in info:
            continue
        vpn = info.get("VPN", {})
        vpns.append(
            {
                "name": info.get("Name", ""),
                "app": info.get("ApplicationName", ""),
                "enabled": vpn.get("Enabled", False) if isinstance(vpn, dict) else False,
            }
        )
    return vpns


def parse_partitions(base_dir: str) -> list[str]:
    """Extract APFS partition info from mount output."""
    mount_file = os.path.join(base_dir, "mount.txt")
    if not os.path.exists(mount_file):
        return []

    partitions = []
    with open(mount_file) as f:
        for line in f:
            if "apfs" in line or "devfs" in line:
                partitions.append(line.strip())
    return partitions


def parse_device_config(conn: sqlite3.Connection) -> dict:
    """Extract device configuration."""
    cur = conn.cursor()
    try:
        cur.execute(
            "SELECT DeviceDiskSize, RemainingDiskSpace, Baseband, BasebandFirmware, Device_SoC "
            "FROM PLConfigAgent_EventNone_Config LIMIT 1"
        )
        row = cur.fetchone()
        if row:
            return {
                "disk_size_gb": row[0],
                "free_space_gb": row[1],
                "baseband": row[2],
                "baseband_firmware": row[3],
                "soc": row[4],
            }
    except sqlite3.OperationalError:
        pass
    return {}


def parse_system_info(parsed_dir: str) -> dict:
    """Extract OS version and build info."""
    sys_file = os.path.join(parsed_dir, "sys.jsonl")
    if not os.path.exists(sys_file):
        return {}

    try:
        with open(sys_file) as f:
            entry = json.loads(f.readline())
        return entry.get("data", {})
    except (json.JSONDecodeError, IOError):
        return {}


def bundle_display_name(bundle_id: str) -> str:
    """Convert a bundle ID to a readable short name.
    
    Examples:
        com.apple.mobilesafari -> mobilesafari
        com.tencent.xin -> xin
        org.example.app -> app
    """
    if not bundle_id:
        return "unknown"
    parts = bundle_id.split(".")
    return parts[-1] if parts else bundle_id


def extract_all(base_dir: str, parsed_dir: str | None = None, max_points: int = 200) -> dict:
    """Run full extraction pipeline and return structured data dict."""
    data = {}

    # Raw data (no SAF/DB needed)
    data["crashes"] = parse_crashes(base_dir, parsed_dir)
    data["partitions"] = parse_partitions(base_dir)
    data["nand_smart"] = parse_nand_smart(base_dir)

    # SAF parsed data (optional)
    if parsed_dir and os.path.isdir(parsed_dir):
        data["system"] = parse_system_info(parsed_dir)
        data["vpn_extensions"] = parse_vpn_extensions(parsed_dir)
    else:
        data["system"] = {}
        data["vpn_extensions"] = []

    # PowerLog database
    pl = find_powerlog(base_dir)
    if pl:
        conn = sqlite3.connect(pl)
        try:
            data["battery"] = parse_battery(conn)
            data["battery_trend"] = parse_battery_trend(conn, max_points)
            data["device_config"] = parse_device_config(conn)
            data["app_nand_writers"] = parse_app_nand_writers(conn)
            data["app_screen_time"] = parse_app_screen_time(conn)
            data["app_energy"] = parse_app_energy(conn)
            data["app_cpu"] = parse_app_cpu(conn)
            data["app_memory"] = parse_app_memory(conn)
            data["brightness_trend"] = parse_brightness_trend(conn)
            data["gps_usage"] = parse_gps_usage(conn)
            data["network_usage"] = parse_network_usage(conn)
            data["app_exits"] = parse_app_exits(conn)
            data["process_exits"] = parse_process_exits(conn)
        finally:
            conn.close()

    return data


def main():
    import argparse

    parser = argparse.ArgumentParser(
        description="Extract data from iPhone sysdiagnose archives",
        epilog="Output is JSON to stdout. Redirect to a file for later use.",
    )
    parser.add_argument("base_dir", help="Extracted sysdiagnose directory (contains logs/, ASPSnapshots/, etc.)")
    parser.add_argument("parsed_dir", nargs="?", default=None, help="SAF parsed data directory (optional)")
    parser.add_argument("--max-points", type=int, default=200, help="Max data points for time series (default: 200)")
    parser.add_argument("-o", "--output", help="Output file (default: stdout)")

    args = parser.parse_args()

    if not os.path.isdir(args.base_dir):
        parser.error(f"Base directory not found: {args.base_dir}")
    if args.parsed_dir and not os.path.isdir(args.parsed_dir):
        parser.error(f"Parsed directory not found: {args.parsed_dir}")

    data = extract_all(args.base_dir, args.parsed_dir, args.max_points)

    output = json.dumps(data, ensure_ascii=False, indent=2)
    if args.output:
        with open(args.output, "w") as f:
            f.write(output)
        print(f"Written to {args.output}", file=sys.stderr)
    else:
        print(output)


if __name__ == "__main__":
    main()
