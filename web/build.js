#!/usr/bin/env node
/**
 * Build script: combine web/ modules into a single index.html
 * Pure offline — all libraries inlined.
 * Usage: node web/build.js
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectDir = join(__dirname, '..');

const reportSrc = readFileSync(join(projectDir, 'scripts', 'report.mjs'), 'utf-8');

// Extract CSS
const cssMatch = reportSrc.match(/const CSS = `\\([\s\S]*?)`;/);
const css = cssMatch ? cssMatch[1].replace(/\\\n/g, '\n') : '';

// Extract CHART_JS
const chartJsMatch = reportSrc.match(/const CHART_JS = `([\s\S]*?)`;/);
const chartJs = chartJsMatch ? chartJsMatch[1] : '';

// Extract generateReport
const genMatch = reportSrc.match(/(function generateReport\(data\) \{[\s\S]*?)(?:^export)/m);
const generateReportSrc = genMatch ? genMatch[1].trim() : '';

// Extract helpers
const helpers = [];
const helperNames = ['PRODUCT_TYPE', 'SOC_NAME', 'fmtDatetime', 'fmtDatetimeFull', 'fmtBytes', 'fmtSeconds',
  'shortName', 'detectLanguage', 'healthColor', 'rangeLabel', 'interactiveChartSvg', 'barChartSvg'];
for (const name of helperNames) {
  const re = new RegExp(`^(const ${name}|function ${name})[^{]*\\{`, 'm');
  const m = reportSrc.match(re);
  if (m) {
    const start = m.index;
    let depth = 0, end = start;
    for (let i = start; i < reportSrc.length; i++) {
      if (reportSrc[i] === '{') depth++;
      if (reportSrc[i] === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
    }
    helpers.push(reportSrc.slice(start, end));
  }
}

// Web modules
const vfsJs = readFileSync(join(__dirname, 'vfs.js'), 'utf-8');
const extractJs = readFileSync(join(__dirname, 'extract.js'), 'utf-8');

// Inline libraries
const pakoJs = readFileSync('/tmp/node_modules/pako/dist/pako.min.js', 'utf-8');
const sqlJs = readFileSync('/tmp/node_modules/sql.js/dist/sql-wasm.js', 'utf-8');
const sqlWasmBuf = readFileSync('/tmp/node_modules/sql.js/dist/sql-wasm.wasm');
const sqlWasmB64 = sqlWasmBuf.toString('base64');

// Fix extract.js: replace CDN locateFile with inlined WASM
const extractFixed = extractJs.replace(
  `initSqlJs({ locateFile: file => \`https://sql.js.org/dist/\${file}\` })`,
  `initSqlJs({ locateFile: () => {
      const b64 = '${sqlWasmB64}';
      const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
      return URL.createObjectURL(new Blob([bytes], { type: 'application/wasm' }));
    } })`
);

const head = '<!DOCTYPE html>\n<html lang="zh-CN">\n<head>\n<meta charset="UTF-8">\n<meta name="viewport" content="width=device-width,initial-scale=1">\n<title>iPhone Sysdiagnose Analyzer</title>\n<style>\n' +
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
  css + '\n</style>\n</head>';

const body = '\n<body>\n' +
  '<div class="drop-zone" id="dropZone">\n' +
  '  <div class="drop-zone-inner" id="dropInner">\n' +
  '    <svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm-1 2l5 5h-5V4zM6 20V4h5v7h7v9H6z"/></svg>\n' +
  '    <p>拖入 <strong>.tar.gz</strong> sysdiagnose 文件<br>或 <span class="browse" id="browseBtn">点击选择文件</span></p>\n' +
  '    <div class="progress-bar" id="progressBar" style="display:none"><div class="fill" id="progressFill"></div></div>\n' +
  '    <div class="progress-text" id="progressText"></div>\n' +
  '  </div>\n' +
  '  <input type="file" id="fileInput" accept=".tar.gz,.tgz" style="display:none">\n' +
  '</div>\n<div id="reportContainer"></div>\n';

// Inline pako
const libScript = '<script>' + pakoJs + '</script>\n';

// Inline sql.js (the library itself, not the WASM — that's embedded in extractFixed via base64)
const sqlScript = '<script>' + sqlJs + '</script>\n';

// App script
const chartJsEscaped = JSON.stringify(chartJs);
const appScript = '<script>\n' +
  vfsJs + '\n\n' +
  extractFixed + '\n\n' +
  helpers.join('\n\n') + '\n\n' +
  generateReportSrc + '\n\n' +
  'const CHART_JS_DATA = ' + chartJsEscaped + ';\n\n' +
  '(function() {\n' +
  '  var dropZone = document.getElementById("dropZone");\n' +
  '  var fileInput = document.getElementById("fileInput");\n' +
  '  var browseBtn = document.getElementById("browseBtn");\n' +
  '  var progressBar = document.getElementById("progressBar");\n' +
  '  var progressFill = document.getElementById("progressFill");\n' +
  '  var progressText = document.getElementById("progressText");\n' +
  '  var reportContainer = document.getElementById("reportContainer");\n' +
  '  browseBtn.addEventListener("click", function() { fileInput.click(); });\n' +
  '  fileInput.addEventListener("change", function(e) { if (e.target.files[0]) handleFile(e.target.files[0]); });\n' +
  '  dropZone.addEventListener("dragover", function(e) { e.preventDefault(); dropZone.classList.add("drag-over"); });\n' +
  '  dropZone.addEventListener("dragleave", function() { dropZone.classList.remove("drag-over"); });\n' +
  '  dropZone.addEventListener("drop", function(e) {\n' +
  '    e.preventDefault(); dropZone.classList.remove("drag-over");\n' +
  '    var file = e.dataTransfer.files[0]; if (file) handleFile(file);\n' +
  '  });\n' +
  '  function setProgress(pct, text) {\n' +
  '    progressBar.style.display = "block";\n' +
  '    progressFill.style.width = pct + "%";\n' +
  '    progressText.textContent = text;\n' +
  '  }\n' +
  '  async function handleFile(file) {\n' +
  '    setProgress(5, "读取文件...");\n' +
  '    try {\n' +
  '      var buf = await file.arrayBuffer();\n' +
  '      setProgress(10, "解压 gzip...");\n' +
  '      var tarBuf = pako.ungzip(new Uint8Array(buf));\n' +
  '      setProgress(30, "解析 tar...");\n' +
  '      var vfs = new VFS();\n' +
  '      parseTar(tarBuf, vfs);\n' +
  '      setProgress(50, vfs.files.size + " 个文件已加载");\n' +
  '      var baseDir = Array.from(vfs.dirs).find(function(d) { return d.startsWith("sysdiagnose_") && d.split("/").length === 1; })\n' +
  '        || Array.from(vfs.dirs).find(function(d) { return d.includes("sysdiagnose_"); });\n' +
  '      if (!baseDir) throw new Error("未找到 sysdiagnose 目录");\n' +
  '      setProgress(55, "加载 SQLite...");\n' +
  '      var data = await extractAll(vfs, baseDir, 200);\n' +
  '      setProgress(90, "生成报告...");\n' +
  '      reportContainer.innerHTML = generateReport(data);\n' +
  '      var s = document.createElement("script");\n' +
  '      s.textContent = CHART_JS_DATA;\n' +
  '      document.body.appendChild(s);\n' +
  '      dropZone.classList.add("hidden");\n' +
  '    } catch (err) {\n' +
  '      progressText.textContent = "❌ " + err.message;\n' +
  '      console.error(err);\n' +
  '    }\n' +
  '  }\n' +
  '})();\n' +
  '</script>\n';

const html = head + body + libScript + sqlScript + appScript + '</body>\n</html>';

const outPath = join(projectDir, 'index.html');
writeFileSync(outPath, html);
console.log('Built: ' + outPath + ' (' + (html.length / 1024).toFixed(0) + ' KB) — 纯离线');
