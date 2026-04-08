/**
 * Browser-adapted extract logic
 * Same algorithms as scripts/extract.mjs but reads from VFS instead of fs
 */

// ─── Helpers ────────────────────────────────────────────────────────────────

function extractStrings(buf, minLength = 4) {
  const parts = [];
  let seq = '';
  for (let i = 0; i < buf.length; i++) {
    const b = buf[i];
    if ((b >= 0x20 && b < 0x7f) || b === 0x09) { seq += String.fromCharCode(b); }
    else { if (seq.length >= minLength) parts.push(seq); seq = ''; }
  }
  if (seq.length >= minLength) parts.push(seq);
  return parts.join('\n');
}

function findPowerlog(vfs, baseDir) {
  // Primary: standard path
  const plDir = baseDir + '/logs/powerlogs';
  if (vfs.existsSync(plDir)) {
    for (const f of vfs.readdirSync(plDir)) {
      if (f.endsWith('.PLSQL')) return plDir + '/' + f;
    }
  }
  // Fallback: search entire VFS for any .PLSQL file (handles path variations)
  for (const path of vfs.files.keys()) {
    if (path.endsWith('.PLSQL') && path.includes('powerlog')) return path;
  }
  // Last resort: any .PLSQL anywhere
  for (const path of vfs.files.keys()) {
    if (path.endsWith('.PLSQL')) return path;
  }
  return null;
}

function safeQuery(db, sql, params = []) {
  try {
    const stmt = db.prepare(sql);
    if (params.length) stmt.bind(params);
    const rows = [];
    while (stmt.step()) rows.push(stmt.getAsObject());
    stmt.free();
    return rows;
  } catch { return []; }
}

function safeOne(db, sql, params = []) {
  try {
    const stmt = db.prepare(sql);
    if (params.length) stmt.bind(params);
    const row = stmt.step() ? stmt.getAsObject() : null;
    stmt.free();
    return row;
  } catch { return null; }
}

// ─── Battery ────────────────────────────────────────────────────────────────

function parseBattery(db) {
  const row = safeOne(db,
    `SELECT CycleCount, DesignCapacity, AppleRawMaxCapacity, Temperature,
            Voltage, NominalChargeCapacity, Level, MaxCapacity
     FROM PLBatteryAgent_EventBackward_Battery ORDER BY timestamp DESC LIMIT 1`
  );
  if (!row) return {};
  const cfg = safeOne(db,
    `SELECT batteryServiceFlags, MaximumCapacityPercent, TotalOperatingTime
     FROM PLBatteryAgent_EventNone_BatteryConfig ORDER BY timestamp DESC LIMIT 1`
  );
  return {
    cycle_count: row.CycleCount,
    design_capacity_mah: row.DesignCapacity,
    current_max_capacity_mah: row.AppleRawMaxCapacity,
    temperature_c: row.Temperature,
    voltage_mv: row.Voltage,
    nominal_capacity_mah: row.NominalChargeCapacity,
    level_pct: row.Level,
    health_pct: (row.DesignCapacity && row.AppleRawMaxCapacity)
      ? Math.round(row.AppleRawMaxCapacity / row.DesignCapacity * 1000) / 10 : null,
    service_flags: cfg?.batteryServiceFlags,
    max_capacity_pct_reported: cfg?.MaximumCapacityPercent,
    total_operating_hours: cfg?.TotalOperatingTime,
  };
}

function parseBatteryTrend(db, maxPoints = 200) {
  const range = safeOne(db, `SELECT MIN(timestamp) as min_ts, MAX(timestamp) as max_ts FROM PLBatteryAgent_EventBackward_Battery`);
  const rows = safeQuery(db, `SELECT timestamp, Level, Voltage, Temperature, IsCharging, Amperage FROM PLBatteryAgent_EventBackward_Battery ORDER BY timestamp`);
  if (!rows.length) return { items: [], min_ts: null, max_ts: null };
  const step = Math.max(1, Math.floor(rows.length / maxPoints));
  const brightRows = safeQuery(db, `SELECT timestamp, Brightness FROM PLDisplayAgent_EventForward_Display ORDER BY timestamp`);
  let bi = 0;
  const items = [];
  for (let i = 0; i < rows.length; i += step) {
    const ts = rows[i].timestamp;
    while (bi < brightRows.length - 1 && brightRows[bi + 1].timestamp <= ts) bi++;
    items.push({
      ts, level: rows[i].Level, voltage: rows[i].Voltage,
      temp: rows[i].Temperature, charging: !!rows[i].IsCharging,
      amperage: rows[i].Amperage,
      screen_on: brightRows.length > 0 ? (brightRows[bi].Brightness > 0) : null,
    });
  }
  return { items, min_ts: range?.min_ts, max_ts: range?.max_ts };
}

function parseBatterySummary(db) {
  const rows = safeQuery(db, `SELECT timestamp, Level, IsCharging, Amperage FROM PLBatteryAgent_EventBackward_Battery ORDER BY timestamp`);
  if (rows.length < 2) return {};
  let sessionStart = 0, sessionCharging = !!rows[0].IsCharging;
  const sessions = [];
  for (let i = 1; i <= rows.length; i++) {
    const isCharging = i < rows.length ? !!rows[i].IsCharging : !sessionCharging;
    if (isCharging !== sessionCharging || i === rows.length) {
      const dt = (rows[i - 1].timestamp - rows[sessionStart].timestamp) / 3600;
      const dLevel = rows[i - 1].Level - rows[sessionStart].Level;
      if (dt >= 0.1) sessions.push({ charging: sessionCharging, dt, dLevel });
      sessionStart = i;
      sessionCharging = isCharging;
    }
  }
  let totalDischargePct = 0, totalDischargeH = 0, totalChargePct = 0, totalChargeH = 0, chargeSessions = 0;
  const dischargeRates = [], chargeRates = [];
  for (const s of sessions) {
    if (s.charging && s.dLevel > 0) { totalChargePct += s.dLevel; totalChargeH += s.dt; chargeSessions++; chargeRates.push(s.dLevel / s.dt); }
    else if (!s.charging && s.dLevel < 0) { totalDischargePct += Math.abs(s.dLevel); totalDischargeH += s.dt; dischargeRates.push(Math.abs(s.dLevel) / s.dt); }
  }
  const spanDays = Math.max(1, (rows[rows.length - 1].timestamp - rows[0].timestamp) / 86400);
  const median = arr => { if (!arr.length) return 0; const s = [...arr].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
  const avg = arr => arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length * 10) / 10 : 0;
  return {
    span_days: Math.round(spanDays * 10) / 10,
    avg_discharge_pct_per_day: Math.round(totalDischargePct / spanDays * 10) / 10,
    avg_discharge_rate_pct_h: avg(dischargeRates), avg_charge_rate_pct_h: avg(chargeRates),
    max_discharge_rate_pct_h: dischargeRates.length ? Math.round(Math.max(...dischargeRates) * 10) / 10 : 0,
    max_charge_rate_pct_h: chargeRates.length ? Math.round(Math.max(...chargeRates) * 10) / 10 : 0,
    total_discharge_pct: Math.round(totalDischargePct), total_charge_pct: Math.round(totalChargePct),
    charge_sessions: chargeSessions,
  };
}

// ─── NAND SMART ─────────────────────────────────────────────────────────────

function parseNandSmart(vfs, baseDir) {
  const aspLog = baseDir + '/ASPSnapshots/asptool_snapshot.log';
  if (!vfs.existsSync(aspLog)) return {};
  const raw = vfs.readFileSync(aspLog);
  if (!raw) return {};
  const text = extractStrings(raw);
  const patterns = {
    host_writes_sectors: /hostWrites:\s*(\d+)/, host_reads_sectors: /hostReads:\s*(\d+)/,
    nand_writes_sectors: /nandWrites:\s*(\d+)/, nand_reads_sectors: /nandReads:\s*(\d+)/,
    band_erases: /bandErases:\s*(\d+)/, power_on_hours: /powerOnHours:\s*(\d+)/,
    smart_crit_warnings: /smartCritWarnings:\s*(\d+)/, factory_bad_blocks: /numFactoryBad:\s*(\d+)/,
    grown_bad_blocks: /numGrownBad:\s*(\d+)/, retired_blocks: /numRetiredBlocks:\s*(\d+)/,
    percent_used: /percentUsed:\s*(\d+)/, avg_tlc_pe_cycles: /averageTLCPECycles:\s*(\d+)/,
    max_native_endurance: /maxNativeEndurance:\s*(\d+)/, write_amp: /WriteAmp:\s*([\d.]+)/,
    uecc_reads: /ueccReads:\s*(\d+)/, num_pfail: /numPfail:\s*(\d+)/, num_efail: /numEfail:\s*(\d+)/,
    unclean_boots: /uncleanBoots:\s*(\d+)/, total_boots: /boots:\s*(\d+)/,
    max_pe_cycles_user: /Max\s*\(\s*(\d+)/, min_pe_cycles_user: /Min\s*\(\s*(\d+)/,
    avg_pe_cycles_user: /Avg\s*\(\s*(\d+)/,
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

// ─── Crashes ────────────────────────────────────────────────────────────────

function parseCrashes(vfs, baseDir) {
  const crashDir = baseDir + '/crashes_and_spins';
  const counts = { jetsam: 0, safari: 0, disk_writes: 0, cpu_resource: 0, sfa: 0, other: 0, details: [] };
  let total = 0;
  if (!vfs.existsSync(crashDir)) { counts.total = 0; return counts; }
  for (const fname of vfs.readdirSync(crashDir).sort()) {
    if (!fname.endsWith('.ips') || fname.startsWith('._') || fname.startsWith('stacks-')) continue;
    total++;
    const fl = fname.toLowerCase();
    if (fl.includes('jetsam')) {
      counts.jetsam++;
      const content = vfs.readTextSync(crashDir + '/' + fname);
      if (content) {
        const procMatch = content.slice(0, 5000).match(/"largestProcess"\s*:\s*"([^"]+)"/)
          || content.slice(0, 5000).match(/"procname"\s*:\s*"([^"]+)"/);
        if (procMatch) counts.details.push({ type: 'jetsam', app: procMatch[1], file: fname });
      }
    } else if (fl.includes('safari') || fl.includes('excuserfault_mobilesafari')) counts.safari++;
    else if (fl.includes('diskwrites') || fl.includes('disk_writes')) {
      counts.disk_writes++;
      counts.details.push({ type: 'disk_writes', app: fname.split('.')[0], file: fname });
    } else if (fl.includes('cpu_resource')) counts.cpu_resource++;
    else if (fname.startsWith('SFA-')) counts.sfa++;
    else counts.other++;
  }
  counts.total = total;
  return counts;
}

// ─── App Rankings ───────────────────────────────────────────────────────────

function parseAppNandWriters(db, limit = 25) {
  const range = safeOne(db, `SELECT MIN(timestamp) as min_ts, MAX(timestamp) as max_ts FROM PLCoalitionAgent_Aggregate_NANDStats`);
  return {
    items: safeQuery(db, `SELECT BundleId, SUM(LogicalWrites) as total FROM PLCoalitionAgent_Aggregate_NANDStats WHERE BundleId IS NOT NULL AND BundleId != '' GROUP BY BundleId ORDER BY total DESC LIMIT ?`, [limit])
      .map(r => ({ bundle_id: r.BundleId, logical_writes_bytes: r.total })),
    min_ts: range?.min_ts, max_ts: range?.max_ts,
  };
}

function parseAppScreenTime(db, limit = 25) {
  const range = safeOne(db, `SELECT MIN(timestamp) as min_ts, MAX(timestamp) as max_ts FROM PLAppTimeService_Aggregate_AppRunTime`);
  return {
    items: safeQuery(db, `SELECT BundleID, SUM(ScreenOnTime) as screen, SUM(BackgroundTime) as bg FROM PLAppTimeService_Aggregate_AppRunTime WHERE BundleID IS NOT NULL AND BundleID != '' GROUP BY BundleID ORDER BY screen DESC LIMIT ?`, [limit])
      .map(r => ({ bundle_id: r.BundleID, foreground_sec: r.screen || 0, background_sec: r.bg || 0 })),
    min_ts: range?.min_ts, max_ts: range?.max_ts,
  };
}

function parseAppMemory(db, limit = 15) {
  return safeQuery(db, `SELECT AppBundleId, MAX(PeakMemory) as peak FROM PLApplicationAgent_EventBackward_ApplicationMemory WHERE AppBundleId IS NOT NULL AND AppBundleId != '' GROUP BY AppBundleId ORDER BY peak DESC LIMIT ?`, [limit])
    .map(r => ({ bundle_id: r.AppBundleId, peak_memory_kb: r.peak || 0 }));
}

function parseGpsUsage(db, limit = 15) {
  const range = safeOne(db, `SELECT MIN(timestamp) as min_ts, MAX(timestamp) as max_ts FROM PLLocationAgent_EventForward_ClientStatus`);
  return {
    items: safeQuery(db, `SELECT BundleId, COUNT(*) as uses FROM PLLocationAgent_EventForward_ClientStatus WHERE BundleId IS NOT NULL AND BundleId != '' AND InUseLevel > 0 GROUP BY BundleId ORDER BY uses DESC LIMIT ?`, [limit])
      .map(r => ({ bundle_id: r.BundleId, location_requests: r.uses })),
    min_ts: range?.min_ts, max_ts: range?.max_ts,
  };
}

function parseNetworkUsage(db, limit = 15) {
  const range = safeOne(db, `SELECT MIN(timestamp) as min_ts, MAX(timestamp) as max_ts FROM PLProcessNetworkAgent_EventInterval_UsageDiff`);
  const cols = safeQuery(db, `PRAGMA table_info(PLProcessNetworkAgent_EventInterval_UsageDiff)`).map(c => c.name);
  const hasCell = cols.includes('CellIn') && cols.includes('CellOut');
  const cellSql = hasCell ? ', SUM(CellIn) as ci, SUM(CellOut) as co' : '';
  const orderSql = hasCell ? '(IFNULL(wi,0)+IFNULL(wo,0)+IFNULL(ci,0)+IFNULL(co,0))' : '(IFNULL(wi,0)+IFNULL(wo,0))';
  return {
    items: safeQuery(db, `SELECT BundleName, SUM(WifiIn) as wi, SUM(WifiOut) as wo${cellSql} FROM PLProcessNetworkAgent_EventInterval_UsageDiff WHERE BundleName IS NOT NULL AND BundleName != '' GROUP BY BundleName ORDER BY ${orderSql} DESC LIMIT ?`, [limit])
      .map(r => ({ name: r.BundleName, wifi_in_bytes: r.wi || 0, wifi_out_bytes: r.wo || 0, cellular_in_bytes: r.ci || 0, cellular_out_bytes: r.co || 0 })),
    min_ts: range?.min_ts, max_ts: range?.max_ts,
  };
}

function parseAppExits(db, limit = 15) {
  const reasonDesc = code => ({ 0: '正常退出', 1: '内存回收', 2: '看门狗超时', 3: '崩溃', 5: '挂起超时', 8: '后台超时', 10: '非法访问', 15: '资源耗尽', 16: '看门狗违规' }[code] || `原因码${code}`);
  const range = safeOne(db, `SELECT MIN(timestamp) as min_ts, MAX(timestamp) as max_ts FROM PLApplicationAgent_EventPoint_ApplicationExitReason`);
  return {
    items: safeQuery(db, `SELECT Identifier, COUNT(*) as cnt, Reason FROM PLApplicationAgent_EventPoint_ApplicationExitReason WHERE Identifier IS NOT NULL AND Identifier != '' GROUP BY Identifier, Reason ORDER BY cnt DESC LIMIT ?`, [limit])
      .map(r => ({ bundle_id: r.Identifier, count: r.cnt, reason_code: r.Reason, reason: reasonDesc(r.Reason) })),
    min_ts: range?.min_ts, max_ts: range?.max_ts,
  };
}

function parseBrightnessTrend(db, maxPoints = 150) {
  const range = safeOne(db, `SELECT MIN(timestamp) as min_ts, MAX(timestamp) as max_ts FROM PLDisplayAgent_EventForward_Display`);
  const rows = safeQuery(db, `SELECT timestamp, Brightness FROM PLDisplayAgent_EventForward_Display ORDER BY timestamp`);
  if (rows.length === 0) return { items: [], min_ts: null, max_ts: null };
  const step = Math.max(1, Math.floor(rows.length / maxPoints));
  const items = [];
  for (let i = 0; i < rows.length; i += step) {
    items.push({ ts: rows[i].timestamp, brightness: rows[i].Brightness });
  }
  return { items, min_ts: range?.min_ts, max_ts: range?.max_ts };
}

function parseAppEnergy(db, limit = 25) {
  const range = safeOne(db, `SELECT MIN(timestamp) as min_ts, MAX(timestamp) as max_ts FROM PLDuetService_Aggregate_DuetEnergyAccumulator`);
  return {
    items: safeQuery(db, `SELECT BundleID, SUM(Energy) as total_energy FROM PLDuetService_Aggregate_DuetEnergyAccumulator WHERE BundleID IS NOT NULL AND BundleID != '' GROUP BY BundleID ORDER BY total_energy DESC LIMIT ?`, [limit])
      .map(r => ({ bundle_id: r.BundleID, energy_nj: r.total_energy })),
    min_ts: range?.min_ts, max_ts: range?.max_ts,
  };
}

function parseAppCpu(db, limit = 20) {
  const range = safeOne(db, `SELECT MIN(timestamp) as min_ts, MAX(timestamp) as max_ts FROM PLCoalitionAgent_EventInterval_CoalitionInterval`);
  return {
    items: safeQuery(db, `SELECT LaunchdName, SUM(cpu_time) as cpu, SUM(bytesread) as br, SUM(byteswritten) as bw FROM PLCoalitionAgent_EventInterval_CoalitionInterval WHERE LaunchdName IS NOT NULL AND LaunchdName != '' GROUP BY LaunchdName ORDER BY cpu DESC LIMIT ?`, [limit])
      .map(r => ({ name: r.LaunchdName, cpu_sec: r.cpu || 0, bytes_read: r.br || 0, bytes_written: r.bw || 0 })),
    min_ts: range?.min_ts, max_ts: range?.max_ts,
  };
}

function parseProcessExits(db, limit = 15) {
  const range = safeOne(db, `SELECT MIN(timestamp) as min_ts, MAX(timestamp) as max_ts FROM PLProcessMonitorAgent_EventPoint_ProcessExit`);
  return {
    items: safeQuery(db, `SELECT ProcessName, COUNT(*) as cnt, ReasonNamespace FROM PLProcessMonitorAgent_EventPoint_ProcessExit WHERE ProcessName IS NOT NULL AND ProcessName != '' GROUP BY ProcessName ORDER BY cnt DESC LIMIT ?`, [limit])
      .map(r => ({ name: r.ProcessName, count: r.cnt, namespace: r.ReasonNamespace })),
    min_ts: range?.min_ts, max_ts: range?.max_ts,
  };
}

// ─── Device & System ────────────────────────────────────────────────────────

function detectTimezone(baseDir) {
  const dirName = baseDir.replace(/\/+$/, '').split('/').pop();
  const m = dirName.match(/([+-]\d{4})/);
  if (m) {
    const offset = m[1];
    const hours = parseInt(offset.slice(1, 3), 10) * (offset[0] === '+' ? 1 : -1);
    const mins = parseInt(offset.slice(3, 5), 10) * (offset[0] === '+' ? 1 : -1);
    return { offset, offsetMinutes: hours * 60 + (offset[0] === '+' ? mins : -mins), label: `UTC${offset.slice(0, 3)}:${offset.slice(3)}` };
  }
  return { offset: '+0000', offsetMinutes: 0, label: 'UTC' };
}

function parseDeviceConfig(db) {
  const tableInfo = safeQuery(db, `PRAGMA table_info(PLConfigAgent_EventNone_Config)`);
  if (!tableInfo.length) return {};
  const colSet = new Set(tableInfo.map(c => c.name));
  const wantCols = ['DeviceDiskSize', 'RemainingDiskSpace', 'Baseband', 'BasebandFirmware', 'Device_SoC', 'Device', 'DeviceName', 'Build'];
  const selectCols = wantCols.filter(c => colSet.has(c));
  if (!selectCols.length) return {};
  const row = safeOne(db, `SELECT ${selectCols.join(', ')} FROM PLConfigAgent_EventNone_Config LIMIT 1`);
  if (!row) return {};
  return {
    disk_size_gb: row.DeviceDiskSize ?? null, free_space_gb: row.RemainingDiskSpace ?? null,
    baseband: row.Baseband ?? null, baseband_firmware: row.BasebandFirmware ?? null,
    soc: row.Device_SoC ?? null, device_code: row.Device ?? null,
    device_name: row.DeviceName ?? null, build: row.Build ?? null,
  };
}

function parseDeviceInfo(vfs, baseDir) {
  const file = baseDir + '/remotectl_dumpstate.txt';
  if (!vfs.existsSync(file)) return {};
  const text = vfs.readTextSync(file);
  if (!text) return {};
  const grab = key => { const m = text.match(new RegExp(key + '\\s*=>?\\s*(.+)')); return m ? m[1].trim() : null; };
  return {
    product_type: grab('ProductType'), hardware_platform: grab('HardwarePlatform'),
    device_class: grab('DeviceClass'), model_number: grab('ModelNumber'),
    hw_model: grab('HWModel'), chip_id: grab('ChipID'),
    product_name: grab('ProductName'), product_version: grab('HumanReadableProductVersionString'),
  };
}

function parseUsageSummary(db) {
  const row = safeOne(db, `SELECT SUM(ScreenOn) as total_screen_on_sec, SUM(ScreenOff) as total_screen_off_sec, SUM(PluggedIn) as total_plugged_sec FROM PLAppTimeService_Aggregate_UsageTime`);
  const range = safeOne(db, `SELECT MIN(timestamp) as min_ts, MAX(timestamp) as max_ts FROM PLAppTimeService_Aggregate_UsageTime`);
  const bc = safeOne(db, `SELECT MaximumFCC, MinimumFCC, NCCMax, NCCMin, QmaxCell0, WeightedRa, TotalOperatingTime, DailyMaxSoc, DailyMinSoc FROM PLBatteryAgent_EventNone_BatteryConfig ORDER BY timestamp DESC LIMIT 1`);
  return {
    screen_on_sec: row?.total_screen_on_sec || 0, screen_off_sec: row?.total_screen_off_sec || 0,
    plugged_sec: row?.total_plugged_sec || 0, min_ts: range?.min_ts, max_ts: range?.max_ts,
    fcc_max_mah: bc?.MaximumFCC, fcc_min_mah: bc?.MinimumFCC,
    ncc_max_mah: bc?.NCCMax, ncc_min_mah: bc?.NCCMin,
    qmax_mah: bc?.QmaxCell0, weighted_ra_mohm: bc?.WeightedRa,
    total_op_hours: bc?.TotalOperatingTime, daily_soc_min: bc?.DailyMinSoc, daily_soc_max: bc?.DailyMaxSoc,
  };
}

// ─── Main Pipeline ──────────────────────────────────────────────────────────

async function extractAll(vfs, baseDir, maxPoints = 200) {
  const data = {};
  const diag = []; // diagnostic log

  data.timezone = detectTimezone(baseDir);
  data.device_info = parseDeviceInfo(vfs, baseDir);
  diag.push('VFS files: ' + vfs.files.size + ', dirs: ' + vfs.dirs.size);
  diag.push('Device: ' + (data.device_info.product_type || 'unknown'));

  data.crashes = parseCrashes(vfs, baseDir);
  diag.push('Crashes: ' + (data.crashes.total ?? 0) + ' (dir exists: ' + vfs.existsSync(baseDir + '/crashes_and_spins') + ')');

  data.nand_smart = parseNandSmart(vfs, baseDir);
  diag.push('NAND: ' + (Object.keys(data.nand_smart).length > 0 ? 'OK' : 'empty'));

  const pl = findPowerlog(vfs, baseDir);
  diag.push('PowerLog: ' + (pl || 'NOT FOUND'));
  if (pl) {
    try {
      const SQL = await initSqlJs({ locateFile: file => `https://sql.js.org/dist/${file}` });
      const plBuf = vfs.readFileSync(pl);
      diag.push('PLSQL size: ' + (plBuf ? plBuf.length : 0) + ' bytes');
      const db = new SQL.Database(plBuf);
      try {
        data.battery = parseBattery(db);
        data.battery_trend = parseBatteryTrend(db, maxPoints);
        data.battery_summary = parseBatterySummary(db);
        data.device_config = parseDeviceConfig(db);
        data.usage_summary = parseUsageSummary(db);
        data.app_nand_writers = parseAppNandWriters(db);
        data.app_screen_time = parseAppScreenTime(db);
        data.app_memory = parseAppMemory(db);
        data.gps_usage = parseGpsUsage(db);
        data.network_usage = parseNetworkUsage(db);
        data.app_exits = parseAppExits(db);
        data.brightness_trend = parseBrightnessTrend(db);
        data.app_energy = parseAppEnergy(db);
        data.app_cpu = parseAppCpu(db);
        data.process_exits = parseProcessExits(db);
        diag.push('Battery: ' + (data.battery.health_pct != null ? data.battery.health_pct + '%' : 'empty'));
        diag.push('Apps: ' + (data.app_screen_time.items?.length || 0) + ' entries');
      } finally { db.close(); }
    } catch (e) {
      diag.push('SQL ERROR: ' + e.message);
      console.error('[extract]', e);
    }
  }

  data._diag = diag;
  console.log('[extract]', diag.join(' | '));
  return data;
}
