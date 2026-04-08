#!/usr/bin/env node
/**
 * Build script: combine web/ modules into a single index.html
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

// Extract CHART_JS (between const CHART_JS = ` and the closing `;)
const chartJsMatch = reportSrc.match(/const CHART_JS = `([\s\S]*?)`;/);
const chartJs = chartJsMatch ? chartJsMatch[1] : '';

// Extract generateReport function
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

const vfsJs = readFileSync(join(__dirname, 'vfs.js'), 'utf-8');
const extractJs = readFileSync(join(__dirname, 'extract.js'), 'utf-8');

// Build HTML by parts (avoid nested template literal escaping issues)
const head = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>iPhone Sysdiagnose Analyzer</title>
<style>
.drop-zone{position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;background:var(--bg);z-index:100;transition:opacity .3s}
.drop-zone.hidden{opacity:0;pointer-events:none}
.drop-zone.drag-over{background:#0a0a1a}
.drop-zone-inner{width:400px;height:260px;border:2px dashed #48484a;border-radius:20px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;transition:border-color .2s,background .2s;cursor:pointer}
.drop-zone.drag-over .drop-zone-inner{border-color:var(--green);background:rgba(52,199,89,.05)}
.drop-zone-inner svg{width:48px;height:48px;fill:#636366}
.drop-zone-inner p{color:var(--sec);font-size:.95em;text-align:center;line-height:1.6}
.drop-zone-inner .browse{color:var(--blue);cursor:pointer;text-decoration:underline}
.progress-bar{width:300px;height:4px;background:var(--border);border-radius:2px;overflow:hidden;margin-top:8px}
.progress-bar .fill{height:100%;background:var(--green);width:0%;transition:width .3s}
.progress-text{color:var(--sec);font-size:.82em;margin-top:6px}
` + css + `
</style>
</head>`;

const body = `
<body>
<div class="drop-zone" id="dropZone">
  <div class="drop-zone-inner" id="dropInner">
    <svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm-1 2l5 5h-5V4zM6 20V4h5v7h7v9H6z"/></svg>
    <p>拖入 <strong>.tar.gz</strong> sysdiagnose 文件<br>或 <span class="browse" id="browseBtn">点击选择文件</span></p>
    <div class="progress-bar" id="progressBar" style="display:none"><div class="fill" id="progressFill"></div></div>
    <div class="progress-text" id="progressText"></div>
  </div>
  <input type="file" id="fileInput" accept=".tar.gz,.tgz" style="display:none">
</div>
<div id="reportContainer"></div>
<script src="https://cdnjs.cloudflare.com/ajax/libs/pako/2.1.0/pako.min.js"></` + `script>
<script src="https://sql.js.org/dist/sql-wasm.js"></` + `script>
<script>
` + vfsJs + '\n\n' + extractJs + '\n\n' + helpers.join('\n\n') + '\n\n' + generateReportSrc + `

// Chart JS stored separately to avoid template literal escaping
const CHART_JS_PLACEHOLDER = "REPLACE_WITH_CHART";

// UI Controller
(function() {
  const dropZone = document.getElementById('dropZone');
  const fileInput = document.getElementById('fileInput');
  const browseBtn = document.getElementById('browseBtn');
  const progressBar = document.getElementById('progressBar');
  const progressFill = document.getElementById('progressFill');
  const progressText = document.getElementById('progressText');
  const reportContainer = document.getElementById('reportContainer');

  browseBtn.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', e => { if (e.target.files[0]) handleFile(e.target.files[0]); });
  dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
  dropZone.addEventListener('drop', e => {
    e.preventDefault(); dropZone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0]; if (file) handleFile(file);
  });

  function setProgress(pct, text) {
    progressBar.style.display = 'block';
    progressFill.style.width = pct + '%';
    progressText.textContent = text;
  }

  async function handleFile(file) {
    setProgress(5, '读取文件...');
    try {
      const buf = await file.arrayBuffer();
      setProgress(10, '解压 gzip...');
      const tarBuf = pako.ungzip(new Uint8Array(buf));
      setProgress(30, '解析 tar...');
      const vfs = new VFS();
      parseTar(tarBuf, vfs);
      setProgress(50, vfs.files.size + ' 个文件已加载');
      const baseDir = [...vfs.dirs].find(d => d.startsWith('sysdiagnose_') && d.split('/').length === 1)
        || [...vfs.dirs].find(d => d.includes('sysdiagnose_'));
      if (!baseDir) throw new Error('未找到 sysdiagnose 目录');
      setProgress(55, '加载 SQLite...');
      const data = await extractAll(vfs, baseDir, 200);
      setProgress(90, '生成报告...');
      reportContainer.innerHTML = generateReport(data);
      const script = document.createElement('script');
      script.textContent = CHART_JS_PLACEHOLDER;
      document.body.appendChild(script);
      dropZone.classList.add('hidden');
    } catch (err) {
      progressText.textContent = '❌ ' + err.message;
      console.error(err);
    }
  }
})();
</` + `script>
</body>
</html>`;

// Combine and replace placeholder with actual chart JS
let html = head + body;
html = html.replace('CHART_JS_PLACEHOLDER', JSON.stringify(chartJs));

const outPath = join(projectDir, 'index.html');
writeFileSync(outPath, html);
console.log('Built: ' + outPath + ' (' + (html.length / 1024).toFixed(0) + ' KB)');
