// ══════════════════════════════════════════════
// Web Worker: iPhone Sysdiagnose Analyzer
// Handles: gzip → tar parse → SQLite extraction
// ══════════════════════════════════════════════

// ─── Libraries (injected by build.js) ───
{{PAKO}}
{{SQL_JS}}

// ─── File Whitelist: only extract these from sysdiagnose ───
var FILE_PATTERNS = [
  { suffix: '.PLSQL' },
  { suffix: 'asptool_snapshot.log' },
  { contains: 'crashes_and_spins/', suffix: '.ips' },
  { suffix: 'remotectl_dumpstate.txt' },
];

// ═══ VFS: Virtual File System ═══
function VFS() {
  this.files = new Map();
  this.dirs = new Set();
}
VFS.prototype.addFile = function(path, data) {
  var n = path.replace(/\/+/g, '/').replace(/^\//, '');
  this.files.set(n, data);
  var parts = n.split('/');
  for (var i = 1; i < parts.length; i++) {
    this.dirs.add(parts.slice(0, i).join('/'));
  }
};
VFS.prototype.readFileSync = function(path) {
  return this.files.get(path.replace(/\/+/g, '/').replace(/^\//, ''));
};
VFS.prototype.readTextSync = function(path) {
  var d = this.readFileSync(path);
  return d ? new TextDecoder('utf-8').decode(d) : null;
};
VFS.prototype.existsSync = function(path) {
  var n = path.replace(/\/+/g, '/').replace(/^\//, '');
  return this.files.has(n) || this.dirs.has(n);
};
VFS.prototype.readdirSync = function(path) {
  var n = path.replace(/\/+/g, '/').replace(/\/$/, '').replace(/^\//, '');
  var prefix = n ? n + '/' : '';
  var names = new Set();
  var self = this;
  this.files.forEach(function(_, key) {
    if (key.startsWith(prefix)) {
      var rest = key.slice(prefix.length);
      var name = rest.split('/')[0];
      if (name) names.add(name);
    }
  });
  this.dirs.forEach(function(dir) {
    if (dir.startsWith(prefix)) {
      var rest = dir.slice(prefix.length);
      var name = rest.split('/')[0];
      if (name) names.add(name);
    }
  });
  return Array.from(names).sort();
};

// ═══ Streaming Tar Parser with Filtering ═══
function StreamingTarParser(patterns) {
  this.patterns = patterns;
  this.buf = new Uint8Array(0);
  this.longName = null;
  this.state = 'header';
  this.currentName = '';
  this.currentSize = 0;
  this.currentChunks = [];
  this.currentSkipped = 0;       // bytes skipped so far in current skip
  this.currentDataSkipped = 0;    // actual data bytes skipped
  this.currentDataBlocks = 0;     // total blocks (padded) to skip
  this.foundBaseDir = null;
  this.vfs = new VFS();
}

StreamingTarParser.prototype.shouldKeep = function(filename) {
  if (!this.foundBaseDir) {
    var m = filename.match(/^(sysdiagnose_[^\/]+)\//);
    if (m) this.foundBaseDir = m[1];
  }
  // Exclude AppleDouble resource forks (._ prefix) and PaxHeader metadata
  var base = filename.split('/').pop();
  if (base && base.indexOf('._') === 0) return false;
  if (filename.indexOf('/PaxHeader/') !== -1) return false;
  // Match against whitelist patterns
  for (var i = 0; i < this.patterns.length; i++) {
    var p = this.patterns[i];
    if (p.suffix && filename.endsWith(p.suffix) && (!p.contains || filename.indexOf(p.contains) !== -1)) return true;
    if (p.contains && p.suffix === undefined && filename.indexOf(p.contains) !== -1) return true;
  }
  return false;
};

StreamingTarParser.prototype.feed = function(chunk) {
  var combined = new Uint8Array(this.buf.length + chunk.length);
  combined.set(this.buf);
  combined.set(chunk, this.buf.length);
  this.buf = combined;
  this._pump();
  // Detach from combined ArrayBuffer to allow GC — subarray shares same backing buffer
  if (this.buf.length > 0) {
    this.buf = new Uint8Array(this.buf);
  }
};

StreamingTarParser.prototype._pump = function() {
  var self = this;
  while (true) {
    if (self.state === 'header') {
      if (self.buf.length < 512) return;
      self._parseHeader();
    } else if (self.state === 'collect') {
      self._collectData();
      if (self.state === 'collect') return; // need more data
    } else if (self.state === 'skip') {
      self._skipData();
      if (self.state === 'skip') return; // need more data
    } else {
      return;
    }
  }
};

StreamingTarParser.prototype._parseHeader = function() {
  // End of archive?
  if (this.buf[0] === 0 && this.buf[1] === 0) { this.buf = new Uint8Array(0); return; }

  // Read name
  var name = '';
  for (var i = 0; i < 100 && this.buf[i] !== 0; i++) name += String.fromCharCode(this.buf[i]);
  if (!name) { this.buf = new Uint8Array(0); return; }

  var typeFlag = String.fromCharCode(this.buf[156]);
  var size = _readTarSize(this.buf);
  var dataBlocks = Math.ceil(size / 512) * 512;

  // GNU long name
  if (typeFlag === 'L') {
    if (this.buf.length < 512 + dataBlocks) return;
    var nameData = this.buf.subarray(512, 512 + size);
    this.longName = new TextDecoder().decode(nameData).replace(/\0/g, '');
    this.buf = this.buf.subarray(512 + dataBlocks);
    return;
  }

  // POSIX extended header
  if (typeFlag === 'x' || typeFlag === 'g') {
    if (this.buf.length < 512 + dataBlocks) return;
    var hdrData = new TextDecoder().decode(this.buf.subarray(512, 512 + size));
    var pathMatch = hdrData.match(/\d+ path=(.+)/);
    if (pathMatch) this.longName = pathMatch[1].trim();
    this.buf = this.buf.subarray(512 + dataBlocks);
    return;
  }

  var finalName = this.longName || name;
  this.longName = null;

  // Directory
  if (typeFlag === '5' || finalName.endsWith('/')) {
    this.vfs.dirs.add(finalName.replace(/\/$/, ''));
    this.buf = this.buf.subarray(512);
    // Skip data blocks if any (shouldn't happen for dirs)
    if (dataBlocks > 0) {
      if (this.buf.length < dataBlocks) {
        this.state = 'skip';
        this.currentDataBlocks = dataBlocks;
        this.currentSkipped = this.buf.length;
        this.buf = new Uint8Array(0);
        return;
      }
      this.buf = this.buf.subarray(dataBlocks);
    }
    return;
  }

  // Regular file or link
  var keep = this.shouldKeep(finalName);

  // Non-regular file (link, fifo, etc.) or empty file
  if (size === 0 || (typeFlag !== '0' && typeFlag !== '\0' && typeFlag !== ' ' && typeFlag !== '7')) {
    this.buf = this.buf.subarray(512 + dataBlocks);
    return;
  }

  // Regular file with data
  this.currentName = finalName;
  this.currentSize = size;
  this.currentChunks = [];
  this.buf = this.buf.subarray(512);

  if (keep) {
    this.state = 'collect';
    this._collectData();
  } else {
    this.state = 'skip';
    this.currentDataSkipped = 0;
    this.currentDataBlocks = dataBlocks;
    this.currentSkipped = 0;
    this._skipData();
  }
};

StreamingTarParser.prototype._collectData = function() {
  var needed = this.currentSize - this._dataCollected();
  if (needed <= 0) {
    // Data complete, pad to block boundary
    var totalBlocks = Math.ceil(this.currentSize / 512) * 512;
    var padded = totalBlocks - this.currentSize;
    // We might have consumed overhanging bytes from buf - those are padding
    // Save file
    var totalLen = this._dataCollected();
    var combined = new Uint8Array(this.currentSize);
    var off = 0;
    for (var i = 0; i < this.currentChunks.length; i++) {
      var c = this.currentChunks[i];
      var take = Math.min(c.length, this.currentSize - off);
      combined.set(c.subarray(0, take), off);
      off += take;
    }
    // Save dataCollected before freeing chunks — padding calc needs it
    var collectedNow = this._dataCollected();
    this.vfs.addFile(this.currentName, combined);
    this.currentChunks = []; // Free chunk arrays — they double memory with VFS copy

    // Consume padding
    var paddingLeft = totalBlocks - collectedNow;
    if (paddingLeft > 0) {
      this.buf = this.buf.subarray(Math.min(paddingLeft, this.buf.length));
    }
    this.state = 'header';
    return;
  }

  // Collect what we have in buffer (limited by needed data bytes)
  var avail = Math.min(this.buf.length, needed);
  if (avail > 0) {
    this.currentChunks.push(new Uint8Array(this.buf.subarray(0, avail)));
    this.buf = this.buf.subarray(avail);
  }
  // If we still need more, return (will get next chunk)
  if (this._dataCollected() < this.currentSize) return;

  // Data is complete, but may need padding
  this._collectData(); // recurse to handle completion
};

StreamingTarParser.prototype._dataCollected = function() {
  var s = 0;
  for (var i = 0; i < this.currentChunks.length; i++) s += this.currentChunks[i].length;
  return s;
};

StreamingTarParser.prototype._skipData = function() {
  var remaining = this.currentDataBlocks - this.currentSkipped;
  if (remaining <= 0) {
    this.state = 'header';
    return;
  }

  var consume = Math.min(this.buf.length, remaining);
  this.currentSkipped += consume;
  this.buf = this.buf.subarray(consume);

  if (this.currentSkipped >= this.currentDataBlocks) {
    this.state = 'header';
  }
};

StreamingTarParser.prototype.finish = function() {
  this._pump();
  return { vfs: this.vfs, baseDir: this.foundBaseDir };
};

// ─── Tar size reader ───
function _readTarSize(buf) {
  if (buf[124] & 0x80) {
    var s = 0;
    for (var i = 124; i < 136; i++) s = (s << 8) | buf[i];
    return s;
  }
  var octal = new TextDecoder().decode(buf.subarray(124, 136)).trim();
  return parseInt(octal, 8) || 0;
}

// ═══ Helpers ═══
function extractStrings(buf, minLength) {
  if (!minLength) minLength = 4;
  var parts = [];
  var seq = '';
  for (var i = 0; i < buf.length; i++) {
    var b = buf[i];
    if ((b >= 0x20 && b < 0x7f) || b === 0x09) seq += String.fromCharCode(b);
    else { if (seq.length >= minLength) parts.push(seq); seq = ''; }
  }
  if (seq.length >= minLength) parts.push(seq);
  return parts.join('\n');
}

function findPowerlog(vfs, baseDir) {
  var plDir = baseDir + '/logs/powerlogs';
  if (vfs.existsSync(plDir)) {
    var files = vfs.readdirSync(plDir);
    for (var i = 0; i < files.length; i++)
      if (files[i].endsWith('.PLSQL')) return plDir + '/' + files[i];
  }
  var keys = Array.from(vfs.files.keys());
  for (var i = 0; i < keys.length; i++)
    if (keys[i].endsWith('.PLSQL') && keys[i].indexOf('powerlog') !== -1) return keys[i];
  for (var i = 0; i < keys.length; i++)
    if (keys[i].endsWith('.PLSQL')) return keys[i];
  return null;
}

function safeQuery(db, sql, params) {
  try {
    var stmt = db.prepare(sql);
    if (params && params.length) stmt.bind(params);
    var rows = [];
    while (stmt.step()) rows.push(stmt.getAsObject());
    stmt.free();
    return rows;
  } catch(e) { return []; }
}

function safeOne(db, sql, params) {
  try {
    var stmt = db.prepare(sql);
    if (params && params.length) stmt.bind(params);
    var row = stmt.step() ? stmt.getAsObject() : null;
    stmt.free();
    return row;
  } catch(e) { return null; }
}

// ═══ Battery ═══
function parseBattery(db) {
  var row = safeOne(db, "SELECT CycleCount, DesignCapacity, AppleRawMaxCapacity, Temperature, Voltage, NominalChargeCapacity, Level, MaxCapacity FROM PLBatteryAgent_EventBackward_Battery ORDER BY timestamp DESC LIMIT 1");
  if (!row) return {};
  var cfg = safeOne(db, "SELECT batteryServiceFlags, MaximumCapacityPercent, TotalOperatingTime FROM PLBatteryAgent_EventNone_BatteryConfig ORDER BY timestamp DESC LIMIT 1");
  return {
    cycle_count: row.CycleCount,
    design_capacity_mah: row.DesignCapacity,
    current_max_capacity_mah: row.AppleRawMaxCapacity,
    temperature_c: row.Temperature,
    voltage_mv: row.Voltage,
    nominal_capacity_mah: row.NominalChargeCapacity,
    level_pct: row.Level,
    health_pct: (row.DesignCapacity && row.AppleRawMaxCapacity) ? Math.round(row.AppleRawMaxCapacity / row.DesignCapacity * 1000) / 10 : null,
    service_flags: cfg ? cfg.batteryServiceFlags : undefined,
    max_capacity_pct_reported: cfg ? cfg.MaximumCapacityPercent : undefined,
    total_operating_hours: cfg ? cfg.TotalOperatingTime : undefined,
  };
}

function parseBatteryTrend(db, maxPoints) {
  if (!maxPoints) maxPoints = 200;
  var range = safeOne(db, "SELECT MIN(timestamp) as min_ts, MAX(timestamp) as max_ts FROM PLBatteryAgent_EventBackward_Battery");
  var rows = safeQuery(db, "SELECT timestamp, Level, Voltage, Temperature, IsCharging, Amperage FROM PLBatteryAgent_EventBackward_Battery ORDER BY timestamp");
  if (!rows.length) return { items: [], min_ts: null, max_ts: null };
  var step = Math.max(1, Math.floor(rows.length / maxPoints));
  var brightRows = safeQuery(db, "SELECT timestamp, Brightness FROM PLDisplayAgent_EventForward_Display ORDER BY timestamp");
  var bi = 0;
  var items = [];
  for (var i = 0; i < rows.length; i += step) {
    var ts = rows[i].timestamp;
    while (bi < brightRows.length - 1 && brightRows[bi + 1].timestamp <= ts) bi++;
    items.push({ ts: ts, level: rows[i].Level, voltage: rows[i].Voltage, temp: rows[i].Temperature, charging: !!rows[i].IsCharging, amperage: rows[i].Amperage, screen_on: brightRows.length > 0 ? (brightRows[bi].Brightness > 0) : null });
  }
  return { items: items, min_ts: range ? range.min_ts : null, max_ts: range ? range.max_ts : null };
}

function parseBatterySummary(db) {
  var rows = safeQuery(db, "SELECT timestamp, Level, IsCharging, Amperage FROM PLBatteryAgent_EventBackward_Battery ORDER BY timestamp");
  if (rows.length < 2) return {};
  var sessionStart = 0, sessionCharging = !!rows[0].IsCharging;
  var sessions = [];
  for (var i = 1; i <= rows.length; i++) {
    var isCharging = i < rows.length ? !!rows[i].IsCharging : !sessionCharging;
    if (isCharging !== sessionCharging || i === rows.length) {
      var dt = (rows[i - 1].timestamp - rows[sessionStart].timestamp) / 3600;
      var dLevel = rows[i - 1].Level - rows[sessionStart].Level;
      if (dt >= 0.1) sessions.push({ charging: sessionCharging, dt: dt, dLevel: dLevel });
      sessionStart = i;
      sessionCharging = isCharging;
    }
  }
  var totalDischargePct = 0, totalDischargeH = 0, totalChargePct = 0, totalChargeH = 0, chargeSessions = 0;
  var dischargeRates = [], chargeRates = [];
  for (var i = 0; i < sessions.length; i++) {
    var s = sessions[i];
    if (s.charging && s.dLevel > 0) { totalChargePct += s.dLevel; totalChargeH += s.dt; chargeSessions++; chargeRates.push(s.dLevel / s.dt); }
    else if (!s.charging && s.dLevel < 0) { totalDischargePct += Math.abs(s.dLevel); totalDischargeH += s.dt; dischargeRates.push(Math.abs(s.dLevel) / s.dt); }
  }
  var spanDays = Math.max(1, (rows[rows.length - 1].timestamp - rows[0].timestamp) / 86400);
  function median(arr) { if (!arr.length) return 0; var s = arr.slice().sort(function(a,b){return a-b}); var m = Math.floor(s.length/2); return s.length%2 ? s[m] : (s[m-1]+s[m])/2; }
  function avg(arr) { return arr.length ? Math.round(arr.reduce(function(a,b){return a+b},0) / arr.length * 10) / 10 : 0; }
  return {
    span_days: Math.round(spanDays * 10) / 10,
    avg_discharge_pct_per_day: Math.round(totalDischargePct / spanDays * 10) / 10,
    avg_discharge_rate_pct_h: avg(dischargeRates),
    avg_charge_rate_pct_h: avg(chargeRates),
    total_discharge_pct: Math.round(totalDischargePct),
    total_charge_pct: Math.round(totalChargePct),
    charge_sessions: chargeSessions,
  };
}

// ═══ NAND SMART ═══
function parseNandSmart(vfs, baseDir) {
  var aspLog = baseDir + '/ASPSnapshots/asptool_snapshot.log';
  if (!vfs.existsSync(aspLog)) aspLog = 'ASPSnapshots/asptool_snapshot.log';
  if (!vfs.existsSync(aspLog)) return {};
  var raw = vfs.readFileSync(aspLog);
  if (!raw) return {};
  var text = extractStrings(raw);
  var patterns = {
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
    max_pe_cycles_user: /Max\s*\(\s*(\d+)/,
    min_pe_cycles_user: /Min\s*\(\s*(\d+)/,
    avg_pe_cycles_user: /Avg\s*\(\s*(\d+)/,
  };
  var data = {};
  var keys = Object.keys(patterns);
  for (var i = 0; i < keys.length; i++) {
    var m = text.match(patterns[keys[i]]);
    if (m) data[keys[i]] = m[1].indexOf('.') !== -1 ? parseFloat(m[1]) : parseInt(m[1], 10);
  }
  var eolMatch = text.match(/EoL erase cycles.*?(\d+)/);
  if (eolMatch) data.eol_cycles = parseInt(eolMatch[1], 10);
  return data;
}

// ═══ Crashes ═══
function parseCrashes(vfs, baseDir) {
  var crashDir = baseDir + '/crashes_and_spins';
  if (!vfs.existsSync(crashDir)) crashDir = 'crashes_and_spins';
  var counts = { jetsam: 0, safari: 0, disk_writes: 0, cpu_resource: 0, sfa: 0, other: 0, details: [] };
  if (!vfs.existsSync(crashDir)) { counts.total = 0; return counts; }
  var allFiles = vfs.readdirSync(crashDir);
  var ipsFiles = [];
  for (var i = 0; i < allFiles.length; i++)
    if (allFiles[i].endsWith('.ips')) ipsFiles.push(allFiles[i]);
  ipsFiles.sort();
  var total = 0;
  for (var i = 0; i < ipsFiles.length; i++) {
    var fname = ipsFiles[i];
    if (fname.indexOf('._') === 0 || fname.indexOf('stacks-') === 0) continue;
    total++;
    var fl = fname.toLowerCase();
    if (fl.indexOf('jetsam') !== -1) {
      counts.jetsam++;
      var content = vfs.readTextSync(crashDir + '/' + fname);
      if (content) {
        var procMatch = content.slice(0, 5000).match(/"largestProcess"\s*:\s*"([^"]+)"/) || content.slice(0, 5000).match(/"procname"\s*:\s*"([^"]+)"/);
        if (procMatch) counts.details.push({ type: 'jetsam', app: procMatch[1], file: fname });
      }
    } else if (fl.indexOf('safari') !== -1 || fl.indexOf('excuserfault_mobilesafari') !== -1) counts.safari++;
    else if (fl.indexOf('diskwrites') !== -1 || fl.indexOf('disk_writes') !== -1) {
      counts.disk_writes++;
      counts.details.push({ type: 'disk_writes', app: fname.split('.')[0], file: fname });
    } else if (fl.indexOf('cpu_resource') !== -1) counts.cpu_resource++;
    else if (fname.indexOf('SFA-') === 0) counts.sfa++;
    else counts.other++;
  }
  counts.total = total;
  return counts;
}

// ═══ App Rankings ═══
function parseAppNandWriters(db, limit) {
  if (!limit) limit = 25;
  var range = safeOne(db, "SELECT MIN(timestamp) as min_ts, MAX(timestamp) as max_ts FROM PLCoalitionAgent_Aggregate_NANDStats");
  return {
    items: safeQuery(db, "SELECT BundleId, SUM(LogicalWrites) as total FROM PLCoalitionAgent_Aggregate_NANDStats WHERE BundleId IS NOT NULL AND BundleId != '' GROUP BY BundleId ORDER BY total DESC LIMIT ?", [limit]).map(function(r){ return { bundle_id: r.BundleId, logical_writes_bytes: r.total }; }),
    min_ts: range ? range.min_ts : null, max_ts: range ? range.max_ts : null,
  };
}

function parseAppScreenTime(db, limit) {
  if (!limit) limit = 25;
  var range = safeOne(db, "SELECT MIN(timestamp) as min_ts, MAX(timestamp) as max_ts FROM PLAppTimeService_Aggregate_AppRunTime");
  return {
    items: safeQuery(db, "SELECT BundleID, SUM(ScreenOnTime) as screen, SUM(BackgroundTime) as bg FROM PLAppTimeService_Aggregate_AppRunTime WHERE BundleID IS NOT NULL AND BundleID != '' GROUP BY BundleID ORDER BY screen DESC LIMIT ?", [limit]).map(function(r){ return { bundle_id: r.BundleID, foreground_sec: r.screen || 0, background_sec: r.bg || 0 }; }),
    min_ts: range ? range.min_ts : null, max_ts: range ? range.max_ts : null,
  };
}

function parseAppMemory(db, limit) {
  if (!limit) limit = 15;
  return safeQuery(db, "SELECT AppBundleId, MAX(PeakMemory) as peak FROM PLApplicationAgent_EventBackward_ApplicationMemory WHERE AppBundleId IS NOT NULL AND AppBundleId != '' GROUP BY AppBundleId ORDER BY peak DESC LIMIT ?", [limit]).map(function(r){ return { bundle_id: r.AppBundleId, peak_memory_kb: r.peak || 0 }; });
}

function parseGpsUsage(db, limit) {
  if (!limit) limit = 15;
  var range = safeOne(db, "SELECT MIN(timestamp) as min_ts, MAX(timestamp) as max_ts FROM PLLocationAgent_EventForward_ClientStatus");
  return {
    items: safeQuery(db, "SELECT BundleId, COUNT(*) as uses FROM PLLocationAgent_EventForward_ClientStatus WHERE BundleId IS NOT NULL AND BundleId != '' AND InUseLevel > 0 GROUP BY BundleId ORDER BY uses DESC LIMIT ?", [limit]).map(function(r){ return { bundle_id: r.BundleId, location_requests: r.uses }; }),
    min_ts: range ? range.min_ts : null, max_ts: range ? range.max_ts : null,
  };
}

function parseNetworkUsage(db, limit) {
  if (!limit) limit = 15;
  var range = safeOne(db, "SELECT MIN(timestamp) as min_ts, MAX(timestamp) as max_ts FROM PLProcessNetworkAgent_EventInterval_UsageDiff");
  var cols = safeQuery(db, "PRAGMA table_info(PLProcessNetworkAgent_EventInterval_UsageDiff)").map(function(c){return c.name});
  var hasCell = cols.indexOf('CellIn') !== -1 && cols.indexOf('CellOut') !== -1;
  var cellSql = hasCell ? ', SUM(CellIn) as ci, SUM(CellOut) as co' : '';
  var orderSql = hasCell ? '(IFNULL(wi,0)+IFNULL(wo,0)+IFNULL(ci,0)+IFNULL(co,0))' : '(IFNULL(wi,0)+IFNULL(wo,0))';
  return {
    items: safeQuery(db, "SELECT BundleName, SUM(WifiIn) as wi, SUM(WifiOut) as wo" + cellSql + " FROM PLProcessNetworkAgent_EventInterval_UsageDiff WHERE BundleName IS NOT NULL AND BundleName != '' GROUP BY BundleName ORDER BY " + orderSql + " DESC LIMIT ?", [limit]).map(function(r){ return { name: r.BundleName, wifi_in_bytes: r.wi || 0, wifi_out_bytes: r.wo || 0, cellular_in_bytes: r.ci || 0, cellular_out_bytes: r.co || 0 }; }),
    min_ts: range ? range.min_ts : null, max_ts: range ? range.max_ts : null,
  };
}

function parseAppExits(db, limit) {
  if (!limit) limit = 15;
  function reasonDesc(code) {
    var map = {0:'正常退出',1:'内存回收',2:'看门狗超时',3:'崩溃',5:'挂起超时',8:'后台超时',10:'非法访问',15:'资源耗尽',16:'看门狗违规'};
    return map[code] || ('原因码'+code);
  }
  var range = safeOne(db, "SELECT MIN(timestamp) as min_ts, MAX(timestamp) as max_ts FROM PLApplicationAgent_EventPoint_ApplicationExitReason");
  return {
    items: safeQuery(db, "SELECT Identifier, COUNT(*) as cnt, Reason FROM PLApplicationAgent_EventPoint_ApplicationExitReason WHERE Identifier IS NOT NULL AND Identifier != '' GROUP BY Identifier, Reason ORDER BY cnt DESC LIMIT ?", [limit]).map(function(r){ return { bundle_id: r.Identifier, count: r.cnt, reason_code: r.Reason, reason: reasonDesc(r.Reason) }; }),
    min_ts: range ? range.min_ts : null, max_ts: range ? range.max_ts : null,
  };
}

function parseBrightnessTrend(db, maxPoints) {
  if (!maxPoints) maxPoints = 150;
  var range = safeOne(db, "SELECT MIN(timestamp) as min_ts, MAX(timestamp) as max_ts FROM PLDisplayAgent_EventForward_Display");
  var rows = safeQuery(db, "SELECT timestamp, Brightness FROM PLDisplayAgent_EventForward_Display ORDER BY timestamp");
  if (!rows.length) return { items: [], min_ts: null, max_ts: null };
  var step = Math.max(1, Math.floor(rows.length / maxPoints));
  var items = [];
  for (var i = 0; i < rows.length; i += step)
    items.push({ ts: rows[i].timestamp, brightness: rows[i].Brightness });
  return { items: items, min_ts: range ? range.min_ts : null, max_ts: range ? range.max_ts : null };
}

function parseAppEnergy(db, limit) {
  if (!limit) limit = 25;
  var range = safeOne(db, "SELECT MIN(timestamp) as min_ts, MAX(timestamp) as max_ts FROM PLDuetService_Aggregate_DuetEnergyAccumulator");
  return {
    items: safeQuery(db, "SELECT BundleID, SUM(Energy) as total_energy FROM PLDuetService_Aggregate_DuetEnergyAccumulator WHERE BundleID IS NOT NULL AND BundleID != '' GROUP BY BundleID ORDER BY total_energy DESC LIMIT ?", [limit]).map(function(r){ return { bundle_id: r.BundleID, energy_nj: r.total_energy }; }),
    min_ts: range ? range.min_ts : null, max_ts: range ? range.max_ts : null,
  };
}

function parseAppCpu(db, limit) {
  if (!limit) limit = 20;
  var range = safeOne(db, "SELECT MIN(timestamp) as min_ts, MAX(timestamp) as max_ts FROM PLCoalitionAgent_EventInterval_CoalitionInterval");
  return {
    items: safeQuery(db, "SELECT LaunchdName, SUM(cpu_time) as cpu, SUM(bytesread) as br, SUM(byteswritten) as bw FROM PLCoalitionAgent_EventInterval_CoalitionInterval WHERE LaunchdName IS NOT NULL AND LaunchdName != '' GROUP BY LaunchdName ORDER BY cpu DESC LIMIT ?", [limit]).map(function(r){ return { name: r.LaunchdName, cpu_sec: r.cpu || 0, bytes_read: r.br || 0, bytes_written: r.bw || 0 }; }),
    min_ts: range ? range.min_ts : null, max_ts: range ? range.max_ts : null,
  };
}

function parseProcessExits(db, limit) {
  if (!limit) limit = 15;
  var range = safeOne(db, "SELECT MIN(timestamp) as min_ts, MAX(timestamp) as max_ts FROM PLProcessMonitorAgent_EventPoint_ProcessExit");
  return {
    items: safeQuery(db, "SELECT ProcessName, COUNT(*) as cnt, ReasonNamespace FROM PLProcessMonitorAgent_EventPoint_ProcessExit WHERE ProcessName IS NOT NULL AND ProcessName != '' GROUP BY ProcessName ORDER BY cnt DESC LIMIT ?", [limit]).map(function(r){ return { name: r.ProcessName, count: r.cnt, namespace: r.ReasonNamespace }; }),
    min_ts: range ? range.min_ts : null, max_ts: range ? range.max_ts : null,
  };
}

// ═══ Device & System ═══
function detectTimezone(baseDir) {
  var dirName = baseDir.replace(/\/+$/, '').split('/').pop();
  var m = dirName.match(/([+-]\d{4})/);
  if (m) {
    var offset = m[1];
    var hours = parseInt(offset.slice(1, 3), 10) * (offset[0] === '+' ? 1 : -1);
    var mins = parseInt(offset.slice(3, 5), 10) * (offset[0] === '+' ? 1 : -1);
    return { offset: offset, offsetMinutes: hours * 60 + (offset[0] === '+' ? mins : -mins), label: 'UTC' + offset.slice(0, 3) + ':' + offset.slice(3) };
  }
  return { offset: '+0000', offsetMinutes: 0, label: 'UTC' };
}

function parseDeviceConfig(db) {
  var tableInfo = safeQuery(db, "PRAGMA table_info(PLConfigAgent_EventNone_Config)");
  if (!tableInfo.length) return {};
  var colSet = {};
  for (var i = 0; i < tableInfo.length; i++) colSet[tableInfo[i].name] = true;
  var wantCols = ['DeviceDiskSize','RemainingDiskSpace','Baseband','BasebandFirmware','Device_SoC','Device','DeviceName','Build'];
  var selectCols = [];
  for (var i = 0; i < wantCols.length; i++)
    if (colSet[wantCols[i]]) selectCols.push(wantCols[i]);
  if (!selectCols.length) return {};
  var row = safeOne(db, "SELECT " + selectCols.join(', ') + " FROM PLConfigAgent_EventNone_Config LIMIT 1");
  if (!row) return {};
  return {
    disk_size_gb: row.DeviceDiskSize != null ? row.DeviceDiskSize : null,
    free_space_gb: row.RemainingDiskSpace != null ? row.RemainingDiskSpace : null,
    baseband: row.Baseband || null,
    baseband_firmware: row.BasebandFirmware || null,
    soc: row.Device_SoC || null,
    device_code: row.Device || null,
    device_name: row.DeviceName || null,
    build: row.Build || null,
  };
}

function parseDeviceInfo(vfs, baseDir) {
  var file = baseDir + '/remotectl_dumpstate.txt';
  if (!vfs.existsSync(file)) file = 'remotectl_dumpstate.txt';
  if (!vfs.existsSync(file)) return {};
  var text = vfs.readTextSync(file);
  if (!text) return {};
  function grab(key) { var m = text.match(new RegExp(key + '\\s*=>?\\s*(.+)')); return m ? m[1].trim() : null; }
  return {
    product_type: grab('ProductType'), hardware_platform: grab('HardwarePlatform'),
    device_class: grab('DeviceClass'), model_number: grab('ModelNumber'),
    hw_model: grab('HWModel'), chip_id: grab('ChipID'),
    product_name: grab('ProductName'), product_version: grab('HumanReadableProductVersionString'),
  };
}

function parseUsageSummary(db) {
  var row = safeOne(db, "SELECT SUM(ScreenOn) as total_screen_on_sec, SUM(ScreenOff) as total_screen_off_sec, SUM(PluggedIn) as total_plugged_sec FROM PLAppTimeService_Aggregate_UsageTime");
  var range = safeOne(db, "SELECT MIN(timestamp) as min_ts, MAX(timestamp) as max_ts FROM PLAppTimeService_Aggregate_UsageTime");
  var bc = safeOne(db, "SELECT MaximumFCC, MinimumFCC, NCCMax, NCCMin, QmaxCell0, WeightedRa, TotalOperatingTime, DailyMaxSoc, DailyMinSoc FROM PLBatteryAgent_EventNone_BatteryConfig ORDER BY timestamp DESC LIMIT 1");
  return {
    screen_on_sec: row ? row.total_screen_on_sec || 0 : 0,
    screen_off_sec: row ? row.total_screen_off_sec || 0 : 0,
    plugged_sec: row ? row.total_plugged_sec || 0 : 0,
    min_ts: range ? range.min_ts : null, max_ts: range ? range.max_ts : null,
    fcc_max_mah: bc ? bc.MaximumFCC : undefined,
    fcc_min_mah: bc ? bc.MinimumFCC : undefined,
    ncc_max_mah: bc ? bc.NCCMax : undefined,
    ncc_min_mah: bc ? bc.NCCMin : undefined,
    qmax_mah: bc ? bc.QmaxCell0 : undefined,
    weighted_ra_mohm: bc ? bc.WeightedRa : undefined,
    total_op_hours: bc ? bc.TotalOperatingTime : undefined,
    daily_soc_min: bc ? bc.DailyMinSoc : undefined,
    daily_soc_max: bc ? bc.DailyMaxSoc : undefined,
  };
}

// ═══ Main Pipeline (called inside worker) ═══
function extractAll(SQL, vfs, baseDir, maxPoints) {
  if (!maxPoints) maxPoints = 200;
  var data = {};
  var diag = [];

  data.timezone = detectTimezone(baseDir);
  data.device_info = parseDeviceInfo(vfs, baseDir);
  diag.push('VFS files: ' + vfs.files.size + ', dirs: ' + vfs.dirs.size);
  diag.push('Device: ' + (data.device_info.product_type || 'unknown'));

  data.crashes = parseCrashes(vfs, baseDir);
  diag.push('Crashes: ' + (data.crashes.total || 0) + ' (dir exists: ' + vfs.existsSync(baseDir + '/crashes_and_spins') + ')');

  data.nand_smart = parseNandSmart(vfs, baseDir);
  diag.push('NAND: ' + (Object.keys(data.nand_smart).length > 0 ? 'OK' : 'empty'));

  var pl = findPowerlog(vfs, baseDir);
  diag.push('PowerLog: ' + (pl || 'NOT FOUND'));
  if (pl) {
    try {
      var plBuf = vfs.readFileSync(pl);
      diag.push('PLSQL size: ' + (plBuf ? plBuf.length : 0) + ' bytes');
      var db = new SQL.Database(plBuf);
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
        diag.push('Apps: ' + ((data.app_screen_time.items && data.app_screen_time.items.length) || 0) + ' entries');
      } finally { db.close(); }
    } catch (e) {
      diag.push('SQL ERROR: ' + e.message);
      if (typeof console !== 'undefined') console.error('[worker extract]', e);
    }
  }

  data._diag = diag;
  return data;
}

// ═══ Streaming Decompress + Parse ═══
function decompressAndParse(compressedBuffer) {
  return new Promise(function(resolve) {
    var CHUNK = 4 * 1024 * 1024; // 4MB
    var inflator = new pako.Inflate();
    var parser = new StreamingTarParser(FILE_PATTERNS);
    var offset = 0;
    var totalSize = compressedBuffer.byteLength;

    // pako.Inflate uses onData callback for streaming output
    // Override to feed tar parser directly (data NOT stored in inflator.result)
    inflator.onData = function(data) {
      try { parser.feed(data); }
      catch(e) { /* ignore parse errors */ }
    };

    function tick() {
      if (offset >= totalSize) {
        // Final push triggers remaining onData callbacks, then resolves
        inflator.push(new Uint8Array(0), true);
        resolve(parser.finish());
        return;
      }
      var end = Math.min(offset + CHUNK, totalSize);
      var chunk = new Uint8Array(compressedBuffer, offset, end - offset);
      inflator.push(chunk, false);
      offset = end;
      var pct = Math.round(5 + 45 * offset / totalSize);
      self.postMessage({ type: 'progress', pct: pct, text: '解压解析... ' + Math.round(offset/totalSize*100) + '% (' + parser.vfs.files.size + ' 文件)' });
      setTimeout(tick, 0);
    }
    tick();
  });
}

// ═══ WASM Binary (base64, self-contained) ═══
var WASM_B64 = '{{WASM_B64}}';

function getWasmBinary() {
  var binary = atob(WASM_B64);
  var bytes = new Uint8Array(binary.length);
  for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

// ═══ Worker Message Handler ═══
var cachedSQL = null; // cache sql.js module for reuse

self.onmessage = function(e) {
  var msg = e.data;
  if (msg.type === 'process') {
    _handleProcess(msg);
  }
};

async function _handleProcess(msg) {
  try {
    var buffer = msg.buffer;

    self.postMessage({ type: 'progress', pct: 0, text: '开始处理...' });

    // Phase 1: Decompress + filtered tar parse
    var result = await decompressAndParse(buffer);
    var vfs = result.vfs;
    var baseDir = result.baseDir;

    // Phase 2: Init sql.js (once, cached)
    if (!cachedSQL) {
      self.postMessage({ type: 'progress', pct: 50, text: '加载 SQLite 引擎...' });
      cachedSQL = await initSqlJs({ wasmBinary: getWasmBinary() });
    }

    // Phase 3: Extract data
    self.postMessage({ type: 'progress', pct: 55, text: '提取数据...' });
    var data = extractAll(cachedSQL, vfs, baseDir, 200);

    self.postMessage({ type: 'progress', pct: 98, text: '完成' });
    self.postMessage({ type: 'result', data: data });
  } catch (err) {
    self.postMessage({ type: 'error', message: err.message || String(err) });
  }
}
