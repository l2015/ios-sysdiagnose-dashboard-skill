#!/usr/bin/env node
/**
 * Build script — GitHub Pages deployment (v0.3.0)
 *
 * Outputs 2 files:
 *   1. index.html — main page (drop zone + report renderer)
 *   2. worker.js  — Web Worker (pako + tar parse + sql.js extract)
 *
 * Architecture:
 *   Main:    file drop → transfer to Worker → receive data → render report
 *   Worker:  gzip decompress → streaming tar parse (filtered) → sql.js extract
 *
 * Key fix: streaming gzip + filtered VFS avoids holding entire ~2GB
 * decompressed tar in memory. Worker keeps main thread responsive.
 *
 * Usage: node web/build.js
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectDir = join(__dirname, '..');
const appVersion = readFileSync(join(projectDir, 'VERSION'), 'utf-8').trim();
const nodeMod = join(projectDir, 'scripts', 'node_modules');

// ─── Read sources ───
const reportSrc = readFileSync(join(projectDir, 'scripts', 'report.mjs'), 'utf-8');
const workerTpl = readFileSync(join(__dirname, 'worker.template.js'), 'utf-8');
const pakoJs = readFileSync(join(nodeMod, 'pako', 'dist', 'pako.min.js'), 'utf-8');
const sqlJs = readFileSync(join(nodeMod, 'sql.js', 'dist', 'sql-wasm.js'), 'utf-8');
const sqlWasmBuf = readFileSync(join(nodeMod, 'sql.js', 'dist', 'sql-wasm.wasm'));
const sqlWasmB64 = sqlWasmBuf.toString('base64');

// ─── Extract CSS ───
const cssMatch = reportSrc.match(/const CSS = `\\([\s\S]*?)`;/);
const css = cssMatch ? (cssMatch[1]).replace(/\\\n/g, '\n') : '';

// ─── Extract Chart.js ───
const chartJsMatch = reportSrc.match(/const CHART_JS = `([\s\S]*?)`;/);
const chartJs = chartJsMatch ? chartJsMatch[1] : '';

// ─── Extract generateReport ───
const genStartMatch = reportSrc.match(/^function generateReport\(data\) \{/m);
let generateReportSrc = '';
if (genStartMatch) {
  let start = genStartMatch.index, depth = 0, end = start;
  for (let i = start; i < reportSrc.length; i++) {
    if (reportSrc[i] === '{') depth++;
    if (reportSrc[i] === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
  }
  generateReportSrc = reportSrc.slice(start, end).trim();
}

// ─── Extract helpers from report.mjs ───
const helpers = [];
const helperNames = [
  'VERSION', 'PRODUCT_TYPE', 'SOC_NAME',
  'fmtDatetime', 'fmtDatetimeFull', 'fmtBytes', 'fmtSeconds',
  'shortName', 'detectLanguage', 'healthColor', 'rangeLabel',
  'interactiveChartSvg', 'barChartSvg'
];
for (const name of helperNames) {
  const re = new RegExp(`^(const ${name}|function ${name})`, 'm');
  const m = reportSrc.match(re);
  if (!m) continue;
  const start = m.index;
  let parenDepth = 0, braceStart = -1, depth = 0, end = start;
  for (let i = start; i < reportSrc.length; i++) {
    const ch = reportSrc[i];
    if (ch === ';' && braceStart === -1 && parenDepth === 0) { end = i + 1; break; }
    if (ch === '(') parenDepth++;
    else if (ch === ')') parenDepth--;
    else if (ch === '{' && braceStart === -1 && parenDepth === 0) { braceStart = i; depth = 1; }
    else if (braceStart !== -1) {
      if (ch === '{') depth++;
      if (ch === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
    }
  }
  helpers.push(reportSrc.slice(start, end));
}

// ═══════════════════════════════════════════════
//  BUILD worker.js — direct concatenation
// ═══════════════════════════════════════════════
// Normalize line endings to LF to avoid CR/LF mismatch errors
const lf = (s) => s.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
const cleanPako = lf(pakoJs);
const cleanSql = lf(sqlJs);
const cleanTpl = lf(workerTpl);

const pakoIdx = cleanTpl.indexOf('{{PAKO}}');
const sqlIdx = cleanTpl.indexOf('{{SQL_JS}}');
const header = cleanTpl.substring(0, pakoIdx);
const workerBody = cleanTpl.substring(sqlIdx + 10); // {{SQL_JS}} is 10 chars
const workerBodyWithWasm = workerBody.replace('{{WASM_B64}}', sqlWasmB64);

const workerJs = header + cleanPako + ';\n' + cleanSql + ';\n' + workerBodyWithWasm;

writeFileSync(join(projectDir, 'worker.js'), workerJs, 'utf-8');
console.log('Built: worker.js (' + (workerJs.length / 1024).toFixed(0) + ' KB)');

// ═══════════════════════════════════════════════
//  BUILD index.html
// ═══════════════════════════════════════════════
let generateReportSafe = generateReportSrc
  .replace(/<script>/gi, "<scr'+'ipt>")
  .replace(/<\/script>/gi, "</scr'+'ipt>");

const dropCss =
  '.drop-zone{position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;background:var(--bg);z-index:100;transition:opacity .3s}\n' +
  '.drop-zone.hidden{opacity:0;pointer-events:none}\n' +
  '.drop-zone.drag-over{background:#0a0a1a}\n' +
  '.drop-zone-inner{width:400px;height:260px;border:2px dashed #48484a;border-radius:20px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;transition:border-color .2s,background .2s;cursor:pointer}\n' +
  '.drop-zone.drag-over .drop-zone-inner{border-color:var(--green);background:rgba(52,199,89,.05)}\n' +
  '.drop-zone-inner svg{width:48px;height:48px;fill:#636366}\n' +
  '.drop-zone-inner p{color:var(--sec);font-size:.95em;text-align:center;line-height:1.6}\n' +
  '.drop-zone-inner .browse{color:var(--blue);cursor:pointer;text-decoration:underline}\n' +
  '.progress-bar{width:300px;height:4px;background:var(--border);border-radius:2px;overflow:hidden;margin-top:8px}\n' +
  '.progress-bar .fill{height:100%;background:var(--green);width:0%;transition:width .3s}\n' +
  '.progress-text{color:var(--sec);font-size:.82em;margin-top:6px}\n' +
  '.page-footer{text-align:center;padding:12px 0;color:var(--ter);font-size:.7em;line-height:1.5}\n';

const head = '<!DOCTYPE html>\n<html lang="zh-CN">\n<head>\n<meta charset="UTF-8">\n<meta name="viewport" content="width=device-width,initial-scale=1">\n' +
  '<meta name="theme-color" content="#000000">\n' +
  '<meta name="apple-mobile-web-app-capable" content="yes">\n' +
  '<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">\n' +
  '<meta name="apple-mobile-web-app-title" content="Sysdiagnose">\n' +
  '<link rel="manifest" href="./manifest.json">\n' +
  '<link rel="apple-touch-icon" href="./icons/icon-192.png">\n' +
  '<title>iPhone Sysdiagnose Analyzer</title>\n<style>\n' + dropCss + css + '\n</style>\n</head>';

const body =
  '\n<body>\n' +
  '<div class="drop-zone" id="dropZone">\n' +
  '  <div class="drop-zone-inner" id="dropInner">\n' +
  '    <svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm-1 2l5 5h-5V4zM6 20V4h5v7h7v9H6z"/></svg>\n' +
  '    <p>拖入 <strong>.tar.gz</strong> sysdiagnose 文件<br>或 <span class="browse" id="browseBtn">点击选择文件</span></p>\n' +
  '    <div class="progress-bar" id="progressBar" style="display:none"><div class="fill" id="progressFill"></div></div>\n' +
  '    <div class="progress-text" id="progressText"></div>\n' +
  '  </div>\n' +
  '  <input type="file" id="fileInput" accept=".tar.gz,.tgz" style="display:none">\n' +
  '</div>\n<div id="reportContainer"></div>\n' +
  '<div class="page-footer">iPhone Sysdiagnose Analyzer v' + appVersion + '<br>拖入 .tar.gz 文件即可开始分析</div>\n';

const chartJsEscaped = JSON.stringify(chartJs);

const appScript = '<script>\n' +
  helpers.join('\n\n') + '\n\n' +
  generateReportSafe + '\n\n' +
  'var CHART_JS_DATA = ' + chartJsEscaped + ';\n\n' +
  // ─── Main App Logic ───
  '(function() {\n' +
  '  "use strict";\n' +
  '  var dropZone = document.getElementById("dropZone");\n' +
  '  var fileInput = document.getElementById("fileInput");\n' +
  '  var browseBtn = document.getElementById("browseBtn");\n' +
  '  var progressBar = document.getElementById("progressBar");\n' +
  '  var progressFill = document.getElementById("progressFill");\n' +
  '  var progressText = document.getElementById("progressText");\n' +
  '  var reportContainer = document.getElementById("reportContainer");\n' +
  '  var worker = null;\n' +
  '\n' +
  '  browseBtn.addEventListener("click", function() { fileInput.click(); });\n' +
  '  fileInput.addEventListener("change", function(e) { if (e.target.files[0]) runFile(e.target.files[0]); });\n' +
  '  dropZone.addEventListener("dragover", function(e) { e.preventDefault(); dropZone.classList.add("drag-over"); });\n' +
  '  dropZone.addEventListener("dragleave", function() { dropZone.classList.remove("drag-over"); });\n' +
  '  dropZone.addEventListener("drop", function(e) {\n' +
  '    e.preventDefault(); dropZone.classList.remove("drag-over");\n' +
  '    var f = e.dataTransfer.files[0]; if (f) runFile(f);\n' +
  '  });\n' +
  '\n' +
  '  function setProgress(pct, text) {\n' +
  '    progressBar.style.display = "block";\n' +
  '    progressFill.style.width = pct + "%";\n' +
  '    progressText.textContent = text;\n' +
  '  }\n' +
  '\n' +
  '  function killWorker() {\n' +
  '    if (worker) { try { worker.terminate(); } catch(e) {} worker = null; }\n' +
  '  }\n' +
  '\n' +
  '  async function runFile(file) {\n' +
  '    killWorker();\n' +
  '    setProgress(2, "读取文件...");\n' +
  '    try {\n' +
  '      var buf = await file.arrayBuffer();\n' +
  '      setProgress(5, "启动分析引擎...");\n' +
  '\n' +
  '      worker = new Worker("worker.js");\n' +
  '      worker.onmessage = function(e) {\n' +
  '        var msg = e.data;\n' +
  '        if (msg.type === "progress") {\n' +
  '          setProgress(msg.pct, msg.text);\n' +
  '        } else if (msg.type === "result") {\n' +
  '          setProgress(99, "渲染报告...");\n' +
  '          reportContainer.innerHTML = generateReport(msg.data);\n' +
  '          var s = document.createElement("script");\n' +
  '          s.textContent = CHART_JS_DATA;\n' +
  '          document.body.appendChild(s);\n' +
  '          dropZone.classList.add("hidden");\n' +
  '          progressBar.style.display = "none";\n' +
  '          // Debug diagnostics\n' +
  '          setupDebug(msg.data);\n' +
  '        } else if (msg.type === "error") {\n' +
  '          setProgress(0, "\\u274C " + msg.message);\n' +
  '          console.error("[worker]", msg.message);\n' +
  '          killWorker();\n' +
  '        }\n' +
  '      };\n' +
  '      worker.onerror = function(err) {\n' +
  '        setProgress(0, "\\u274C Worker \\u5D29\\u6E83: " + (err.message || "\\u672A\\u77E5\\u9519\\u8BEF"));\n' +
  '        killWorker();\n' +
  '      };\n' +
  '\n' +
  '      // Transfer the file buffer to worker (zero-copy)\n' +
  '      worker.postMessage({ type: "process", buffer: buf }, [buf]);\n' +
  '    } catch (err) {\n' +
  '      setProgress(0, "\\u274C " + err.message);\n' +
  '      console.error(err);\n' +
  '    }\n' +
  '  }\n' +
  '\n' +
  '  function setupDebug(data) {\n' +
  '    if (!data._diag) return;\n' +
  '    var d = data._diag;\n' +
  '    var find = function(p) {\n' +
  '      for (var i = 0; i < d.length; i++) if (d[i].indexOf(p) === 0) return d[i].slice(p.length);\n' +
  '      return "?";\n' +
  '    };\n' +
  '    window._debugDiag = {\n' +
  '      device: find("Device: "),\n' +
  '      nand: find("NAND: "),\n' +
  '      crashes: find("Crashes: "),\n' +
  '      powerlog: find("PowerLog: "),\n' +
  '      battery: find("Battery: "),\n' +
  '      apps: find("Apps: "),\n' +
  '      raw: d\n' +
  '    };\n' +
  '    var plFound = d.some(function(s) { return s.indexOf("PowerLog:") === 0 && s.indexOf("NOT FOUND") === -1; });\n' +
  '    if (!plFound) {\n' +
  '      var warn = document.createElement("div");\n' +
  '      warn.style.cssText = "position:fixed;bottom:16px;left:50%;transform:translateX(-50%);background:#ff9f0a;color:#000;padding:10px 20px;border-radius:12px;font-size:.85em;z-index:200;max-width:90vw;text-align:center;box-shadow:0 4px 16px rgba(0,0,0,.4)";\n' +
  '      warn.textContent = "\\u26A0\\uFE0F PowerLog \\u672A\\u627E\\u5230\\uFF0C\\u62A5\\u544A\\u6570\\u636E\\u4E0D\\u5B8C\\u6574\\u3002\\u70B9\\u51FB\\u5DE6\\u4E0A\\u89D2 Debug \\u6309\\u94AE\\u67E5\\u770B\\u8BCA\\u65AD\\u3002";\n' +
  '      document.body.appendChild(warn);\n' +
  '      setTimeout(function() { warn.style.opacity = "0"; warn.style.transition = "opacity .5s"; setTimeout(function() { warn.remove(); }, 500); }, 8000);\n' +
  '    }\n' +
  '  }\n' +
  '  if (\'serviceWorker\' in navigator) {\n' +
  '    navigator.serviceWorker.register(\'sw.js\').catch(function() {});\n' +
  '  }\n' +
  '})();\n' +
  '</script>\n';

const html = head + body + appScript + '</body>\n</html>';

const outPath = join(projectDir, 'index.html');
writeFileSync(outPath, html);
console.log('Built: index.html (' + (html.length / 1024).toFixed(0) + ' KB)');
const totalKb = ((workerJs.length + html.length) / 1024).toFixed(0);
console.log('Total: ' + totalKb + ' KB (2 files) — ready for GitHub Pages');
