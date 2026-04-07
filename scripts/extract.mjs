#!/usr/bin/env node
/**
 * iPhone Sysdiagnose Data Extractor
 * Extracts structured data from sysdiagnose archives for reporting.
 * Usage: node extract.mjs <sysdiagnose_dir> [-o output.json] [--max-points 200]
 */

import Database from 'better-sqlite3';
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

// ─── Helpers ────────────────────────────────────────────────────────────────

function findPowerlog(baseDir) {
  const plDir = join(baseDir, 'logs', 'powerlogs');
  if (!existsSync(plDir)) return null;
  for (const f of readdirSync(plDir)) {
    if (f.endsWith('.PLSQL')) return join(plDir, f);
  }
  return null;
}

function safeQuery(db, sql, params = []) {
  try { return db.prepare(sql).all(...params); }
  catch { return []; }
}

function safeOne(db, sql, params = []) {
  try { return db.prepare(sql).get(...params) || null; }
  catch { return null; }
}

// ─── Battery ────────────────────────────────────────────────────────────────

function parseBattery(db) {
  const row = safeOne(db,
    `SELECT CycleCount, DesignCapacity, AppleRawMaxCapacity, Temperature,
            Voltage, NominalChargeCapacity, Level, MaxCapacity
     FROM PLBatteryAgent_EventBackward_Battery ORDER BY timestamp DESC LIMIT 1`
  );
  if (!row) return {};
  return {
    cycle_count: row.CycleCount,
    design_capacity_mah: row.DesignCapacity,
    current_max_capacity_mah: row.AppleRawMaxCapacity,
    temperature_c: row.Temperature,
    voltage_mv: row.Voltage,
    nominal_capacity_mah: row.NominalChargeCapacity,
    level_pct: row.Level,
    health_pct: (row.DesignCapacity && row.AppleRawMaxCapacity)
      ? Math.round(row.AppleRawMaxCapacity / row.DesignCapacity * 1000) / 10
      : null,
    ...(() => {
      const cfg = safeOne(db,
        `SELECT batteryServiceFlags, MaximumCapacityPercent, TotalOperatingTime
         FROM PLBatteryAgent_EventNone_BatteryConfig ORDER BY timestamp DESC LIMIT 1`
      );
      return cfg ? {
        service_flags: cfg.batteryServiceFlags,
        max_capacity_pct_reported: cfg.MaximumCapacityPercent,
        total_operating_hours: cfg.TotalOperatingTime,
      } : {};
    })(),
  };
}

function parseBatteryTrend(db, maxPoints = 200) {
  const rows = safeQuery(db,
    `SELECT timestamp, Level, Voltage, Temperature, IsCharging, Amperage
     FROM PLBatteryAgent_EventBackward_Battery ORDER BY timestamp`
  );
  if (rows.length === 0) return [];
  const step = Math.max(1, Math.floor(rows.length / maxPoints));
  const result = [];
  for (let i = 0; i < rows.length; i += step) {
    result.push({
      ts: rows[i].timestamp, level: rows[i].Level, voltage: rows[i].Voltage,
      temp: rows[i].Temperature, charging: !!rows[i].IsCharging, amperage: rows[i].Amperage,
    });
  }
  return result;
}

// ─── NAND SMART ─────────────────────────────────────────────────────────────

function parseNandSmart(baseDir) {
  const aspLog = join(baseDir, 'ASPSnapshots', 'asptool_snapshot.log');
  if (!existsSync(aspLog)) return {};
  let text;
  try { text = execFileSync('strings', [aspLog], { timeout: 10000, encoding: 'utf-8' }); }
  catch { return {}; }

  const patterns = {
    host_writes_sectors: /hostWrites:\s*(\d+)/,
    host_reads_sectors: /hostReads:\s*(\d+)/,
    nand_writes_sectors: /nandWrites:\s*(\d+)/,
    nand_reads_sectors: /nandReads:\s*(\d+)/,
    band_erases: /bandErases:\s*(\d+)/,
    power_on_hours: /powerOnHours:\s*(\d+)/,
    smart_crit_warnings: /smartCritWarnings:\s*(\d+)/,
    factory_bad_blocks: /numFactoryBad:\s*(\d+)/,
    grown_bad_blocks: /numGrownBad:\s*(\d+)/,
    retired_blocks: /numRetiredBlocks:\s*(\d+)/,
    percent_used: /percentUsed:\s*(\d+)/,
    avg_tlc_pe_cycles: /averageTLCPECycles:\s*(\d+)/,
    max_native_endurance: /maxNativeEndurance:\s*(\d+)/,
    write_amp: /WriteAmp:\s*([\d.]+)/,
    uecc_reads: /ueccReads:\s*(\d+)/,
    num_pfail: /numPfail:\s*(\d+)/,
    num_efail: /numEfail:\s*(\d+)/,
    unclean_boots: /uncleanBoots:\s*(\d+)/,
    total_boots: /boots:\s*(\d+)/,
  };

  const data = {};
  for (const [key, re] of Object.entries(patterns)) {
    const m = text.match(re);
    if (m) data[key] = m[1].includes('.') ? parseFloat(m[1]) : parseInt(m[1], 10);
  }
  const eolMatch = text.match(/EoL erase cycles.*?(\d+)/);
  if (eolMatch) data.eol_cycles = parseInt(eolMatch[1], 10);
  return data;
}

// ─── App Rankings ───────────────────────────────────────────────────────────

function parseAppNandWriters(db, limit = 25) {
  const range = safeOne(db, `SELECT MIN(timestamp) as min_ts, MAX(timestamp) as max_ts FROM PLCoalitionAgent_Aggregate_NANDStats`);
  return {
    items: safeQuery(db,
      `SELECT BundleId, SUM(LogicalWrites) as total
       FROM PLCoalitionAgent_Aggregate_NANDStats
       WHERE BundleId IS NOT NULL AND BundleId != ''
       GROUP BY BundleId ORDER BY total DESC LIMIT ?`, [limit]
    ).map(r => ({ bundle_id: r.BundleId, logical_writes_bytes: r.total })),
    min_ts: range?.min_ts,
    max_ts: range?.max_ts,
  };
}

function parseAppScreenTime(db, limit = 25) {
  const range = safeOne(db, `SELECT MIN(timestamp) as min_ts, MAX(timestamp) as max_ts FROM PLAppTimeService_Aggregate_AppRunTime`);
  return {
    items: safeQuery(db,
      `SELECT BundleID, SUM(ScreenOnTime) as screen, SUM(BackgroundTime) as bg
       FROM PLAppTimeService_Aggregate_AppRunTime
       WHERE BundleID IS NOT NULL AND BundleID != ''
       GROUP BY BundleID ORDER BY screen DESC LIMIT ?`, [limit]
    ).map(r => ({ bundle_id: r.BundleID, foreground_sec: r.screen || 0, background_sec: r.bg || 0 })),
    min_ts: range?.min_ts,
    max_ts: range?.max_ts,
  };
}

function parseAppEnergy(db, limit = 25) {
  return safeQuery(db,
    `SELECT BundleID, SUM(Energy) as total_energy
     FROM PLDuetService_Aggregate_DuetEnergyAccumulator
     WHERE BundleID IS NOT NULL AND BundleID != ''
     GROUP BY BundleID ORDER BY total_energy DESC LIMIT ?`, [limit]
  ).map(r => ({ bundle_id: r.BundleID, energy_nj: r.total_energy }));
}

function parseAppCpu(db, limit = 20) {
  return safeQuery(db,
    `SELECT LaunchdName, SUM(cpu_time) as cpu, SUM(bytesread) as br, SUM(byteswritten) as bw
     FROM PLCoalitionAgent_EventInterval_CoalitionInterval
     WHERE LaunchdName IS NOT NULL AND LaunchdName != ''
     GROUP BY LaunchdName ORDER BY cpu DESC LIMIT ?`, [limit]
  ).map(r => ({ name: r.LaunchdName, cpu_sec: r.cpu || 0, bytes_read: r.br || 0, bytes_written: r.bw || 0 }));
}

function parseAppMemory(db, limit = 15) {
  return safeQuery(db,
    `SELECT AppBundleId, MAX(PeakMemory) as peak
     FROM PLApplicationAgent_EventBackward_ApplicationMemory
     WHERE AppBundleId IS NOT NULL AND AppBundleId != ''
     GROUP BY AppBundleId ORDER BY peak DESC LIMIT ?`, [limit]
  ).map(r => ({ bundle_id: r.AppBundleId, peak_memory_kb: r.peak || 0 }));
}

function parseBrightnessTrend(db, maxPoints = 150) {
  const rows = safeQuery(db,
    `SELECT timestamp, Brightness FROM PLDisplayAgent_EventForward_Display ORDER BY timestamp`
  );
  if (rows.length === 0) return [];
  const step = Math.max(1, Math.floor(rows.length / maxPoints));
  const result = [];
  for (let i = 0; i < rows.length; i += step) {
    result.push({ ts: rows[i].timestamp, brightness: rows[i].Brightness });
  }
  return result;
}

function parseGpsUsage(db, limit = 15) {
  return safeQuery(db,
    `SELECT BundleId, COUNT(*) as uses
     FROM PLLocationAgent_EventForward_ClientStatus
     WHERE BundleId IS NOT NULL AND BundleId != '' AND InUseLevel > 0
     GROUP BY BundleId ORDER BY uses DESC LIMIT ?`, [limit]
  ).map(r => ({ bundle_id: r.BundleId, location_requests: r.uses }));
}

function parseNetworkUsage(db, limit = 15) {
  const range = safeOne(db, `SELECT MIN(timestamp) as min_ts, MAX(timestamp) as max_ts FROM PLProcessNetworkAgent_EventInterval_UsageDiff`);
  // Check if Cellular columns exist
  const cols = safeQuery(db, `PRAGMA table_info(PLProcessNetworkAgent_EventInterval_UsageDiff)`).map(c => c.name);
  const hasCell = cols.includes('CellularIn') && cols.includes('CellularOut');
  const cellSql = hasCell ? ', SUM(CellularIn) as ci, SUM(CellularOut) as co' : '';
  const orderSql = hasCell ? '(IFNULL(wi,0)+IFNULL(wo,0)+IFNULL(ci,0)+IFNULL(co,0))' : '(IFNULL(wi,0)+IFNULL(wo,0))';
  return {
    items: safeQuery(db,
      `SELECT BundleName, SUM(WifiIn) as wi, SUM(WifiOut) as wo${cellSql}
       FROM PLProcessNetworkAgent_EventInterval_UsageDiff
       WHERE BundleName IS NOT NULL AND BundleName != ''
       GROUP BY BundleName ORDER BY ${orderSql} DESC LIMIT ?`, [limit]
    ).map(r => ({
      name: r.BundleName,
      wifi_in_bytes: r.wi || 0, wifi_out_bytes: r.wo || 0,
      cellular_in_bytes: r.ci || 0, cellular_out_bytes: r.co || 0,
    })),
    min_ts: range?.min_ts,
    max_ts: range?.max_ts,
  };
}

// ─── Crashes ────────────────────────────────────────────────────────────────

function parseCrashes(baseDir) {
  const crashDir = join(baseDir, 'crashes_and_spins');
  const counts = { jetsam: 0, safari: 0, disk_writes: 0, cpu_resource: 0, sfa: 0, other: 0, details: [] };
  let total = 0;
  if (!existsSync(crashDir)) { counts.total = 0; return counts; }

  for (const fname of readdirSync(crashDir).sort()) {
    if (!fname.endsWith('.ips') || fname.startsWith('._')) continue;
    total++;
    const fl = fname.toLowerCase();
    if (fl.includes('jetsam')) {
      counts.jetsam++;
      // Extract app name from Jetsam crash files
      try {
        const content = readFileSync(join(crashDir, fname), 'utf-8').slice(0, 3000);
        const procMatch = content.match(/"procname"\s*:\s*"([^"]+)"/);
        if (procMatch) {
          counts.details.push({ type: 'jetsam', app: procMatch[1], file: fname });
        }
      } catch {}
    }
    else if (fl.includes('safari') || fl.includes('excuserfault_mobilesafari')) counts.safari++;
    else if (fl.includes('diskwrites') || fl.includes('disk_writes')) {
      counts.disk_writes++;
      counts.details.push({ type: 'disk_writes', app: fname.split('.')[0], file: fname });
    }
    else if (fl.includes('cpu_resource')) counts.cpu_resource++;
    else if (fname.startsWith('SFA-')) counts.sfa++;
    else counts.other++;
  }
  counts.total = total;
  return counts;
}

// ─── App Exits ──────────────────────────────────────────────────────────────

function parseAppExits(db, limit = 15) {
  const reasonMap = { 0: '正常退出', 1: 'Jetsam内存回收', 2: '看门狗超时', 3: '崩溃' };
  const range = safeOne(db, `SELECT MIN(timestamp) as min_ts, MAX(timestamp) as max_ts FROM PLApplicationAgent_EventPoint_ApplicationExitReason`);
  return {
    items: safeQuery(db,
      `SELECT Identifier, COUNT(*) as cnt, Reason
       FROM PLApplicationAgent_EventPoint_ApplicationExitReason
       WHERE Identifier IS NOT NULL AND Identifier != ''
       GROUP BY Identifier, Reason ORDER BY cnt DESC LIMIT ?`, [limit]
    ).map(r => ({
      bundle_id: r.Identifier, count: r.cnt, reason_code: r.Reason,
      reason: reasonMap[r.Reason] || `未知(${r.Reason})`,
    })),
    min_ts: range?.min_ts,
    max_ts: range?.max_ts,
  };
}

function parseProcessExits(db, limit = 15) {
  return safeQuery(db,
    `SELECT ProcessName, COUNT(*) as cnt, ReasonNamespace
     FROM PLProcessMonitorAgent_EventPoint_ProcessExit
     WHERE ProcessName IS NOT NULL AND ProcessName != ''
     GROUP BY ProcessName ORDER BY cnt DESC LIMIT ?`, [limit]
  ).map(r => ({ name: r.ProcessName, count: r.cnt, namespace: r.ReasonNamespace }));
}

// ─── Timezone from directory name ───────────────────────────────────────────

function detectTimezone(baseDir) {
  // sysdiagnose_2026.04.08_00-00-42+0800_iPhone-OS_iPhone_23D8133
  const dirName = baseDir.split('/').pop();
  const m = dirName.match(/([+-]\d{4})/);
  if (m) {
    const offset = m[1]; // e.g. "+0800"
    const hours = parseInt(offset.slice(1, 3), 10) * (offset[0] === '+' ? 1 : -1);
    const mins = parseInt(offset.slice(3, 5), 10) * (offset[0] === '+' ? 1 : -1);
    return { offset, offsetMinutes: hours * 60 + (offset[0] === '+' ? mins : -mins),
      label: `UTC${offset.slice(0,3)}:${offset.slice(3)}` };
  }
  return { offset: '+0000', offsetMinutes: 0, label: 'UTC' };
}

// ─── Device & System ────────────────────────────────────────────────────────

function parseDeviceConfig(db) {
  const row = safeOne(db,
    `SELECT DeviceDiskSize, RemainingDiskSpace, Baseband, BasebandFirmware, Device_SoC
     FROM PLConfigAgent_EventNone_Config LIMIT 1`
  );
  if (!row) return {};
  return {
    disk_size_gb: row.DeviceDiskSize, free_space_gb: row.RemainingDiskSpace,
    baseband: row.Baseband, baseband_firmware: row.BasebandFirmware, soc: row.Device_SoC,
  };
}

function parsePartitions(baseDir) {
  const mountFile = join(baseDir, 'mount.txt');
  if (!existsSync(mountFile)) return [];
  return readFileSync(mountFile, 'utf-8').split('\n')
    .filter(l => l.includes('apfs') || l.includes('devfs')).map(l => l.trim());
}

// ─── Main Pipeline ──────────────────────────────────────────────────────────

function extractAll(baseDir, maxPoints = 200) {
  const data = {};
  data.timezone = detectTimezone(baseDir);
  data.crashes = parseCrashes(baseDir);
  data.partitions = parsePartitions(baseDir);
  data.nand_smart = parseNandSmart(baseDir);

  const pl = findPowerlog(baseDir);
  if (pl) {
    const db = new Database(pl, { readonly: true });
    try {
      data.battery = parseBattery(db);
      data.battery_trend = parseBatteryTrend(db, maxPoints);
      data.device_config = parseDeviceConfig(db);
      data.app_nand_writers = parseAppNandWriters(db);
      data.app_screen_time = parseAppScreenTime(db);
      data.app_energy = parseAppEnergy(db);
      data.app_cpu = parseAppCpu(db);
      data.app_memory = parseAppMemory(db);
      data.brightness_trend = parseBrightnessTrend(db);
      data.gps_usage = parseGpsUsage(db);
      data.network_usage = parseNetworkUsage(db);
      data.app_exits = parseAppExits(db);
      data.process_exits = parseProcessExits(db);
    } finally {
      db.close();
    }
  }
  return data;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

if (process.argv[1] && process.argv[1].endsWith('extract.mjs')) {
  const args = process.argv.slice(2);
  let baseDir = null, outputFile = null, maxPoints = 200;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '-o' || args[i] === '--output') outputFile = args[++i];
    else if (args[i] === '--max-points') maxPoints = parseInt(args[++i], 10);
    else if (args[i] === '-h' || args[i] === '--help') {
      console.log('Usage: node extract.mjs <sysdiagnose_dir> [-o output.json] [--max-points N]');
      process.exit(0);
    }
    else if (!baseDir) baseDir = args[i];
  }

  if (!baseDir) {
    console.error('Error: sysdiagnose directory required');
    console.error('Usage: node extract.mjs <sysdiagnose_dir> [-o output.json] [--max-points N]');
    process.exit(1);
  }

  try { statSync(baseDir); }
  catch { console.error(`Error: directory not found: ${baseDir}`); process.exit(1); }

  const data = extractAll(baseDir, maxPoints);
  const json = JSON.stringify(data, null, 2);
  if (outputFile) { writeFileSync(outputFile, json); console.error(`Written to ${outputFile}`); }
  else process.stdout.write(json);
}

export { extractAll, parseBattery, parseNandSmart, parseCrashes, parseAppExits };
