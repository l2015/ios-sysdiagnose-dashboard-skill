import { readFileSync, writeFileSync } from 'fs';

const htmlPath = './index.html';
const swPath = './sw.js';

let html = readFileSync(htmlPath, 'utf8');
let sw = readFileSync(swPath, 'utf8');

// ── 1. Bump SW cache version ──────────────────────────────────────
sw = sw.replace("sysdiagnose-v0.3.2", "sysdiagnose-v0.3.3");
writeFileSync(swPath, sw);
console.log('✓ sw.js cache → v0.3.3');

// ── 2. Fix chart JS injection (textContent → text) ───────────────
if (!html.includes('s.textContent = CHART_JS_DATA')) {
  console.error('ERROR: s.textContent line not found in index.html');
  process.exit(1);
}
html = html.replace('s.textContent = CHART_JS_DATA', 's.text = CHART_JS_DATA');
console.log('✓ Fixed s.textContent → s.text');

// ── 3. Add footer to initial (empty) drop-zone page ────────────────
// Insert footer right after reportContainer div, before its closing script tag
const footerHTML = `<div class="footer" id="initFooter">
  <a href="https://github.com/l2015/ios-sysdiagnose-dashboard-skill" target="_blank" rel="noopener" style="color:var(--sec);text-decoration:none">GitHub</a>
  &nbsp;·&nbsp; v0.3.2
  &nbsp;·&nbsp; <span id="visitCount">—</span> visits
</div>
<script>
// Free-counter-style localStorage visit counter
(function(){
  var k='sysd_visits';
  var n=parseInt(localStorage.getItem(k)||'0',10)+1;
  localStorage.setItem(k,n);
  var el=document.getElementById('visitCount');
  if(el) el.textContent=n;
})();
</script>`;

const reportContainerPos = html.indexOf('<div id="reportContainer">');
if (reportContainerPos === -1) {
  console.error('ERROR: reportContainer not found');
  process.exit(1);
}
const insertAfter = reportContainerPos + '<div id="reportContainer">'.length;
html = html.slice(0, insertAfter) + '\n' + footerHTML + '\n' + html.slice(insertAfter);
console.log('✓ Added initial-page footer with visit counter');

// ── 4. Update footer inside generated report (in generateReport) ───
const oldFooter = '<div class="footer">${deviceClass} Sysdiagnose Analyzer v${VERSION} · ${generatedAt} (${tzLabel})</div>';
const newFooter = `<div class="footer">
  <a href="https://github.com/l2015/ios-sysdiagnose-dashboard-skill" target="_blank" rel="noopener" style="color:var(--sec);text-decoration:none">GitHub</a>
  &nbsp;·&nbsp; v\${VERSION}
  &nbsp;·&nbsp; <span class="footer-visits" id="footerVisitCount">—</span> visits
  &nbsp;·&nbsp; \${generatedAt} (\${tzLabel})
</div>
<script>(function(){var el=document.getElementById('footerVisitCount');if(el){var n=parseInt(localStorage.getItem('sysd_visits')||'0',10);el.textContent=n}}())</script>`;

if (!html.includes(oldFooter)) {
  console.error('ERROR: old footer template not found in generateReport');
  process.exit(1);
}
html = html.replace(oldFooter, newFooter);
console.log('✓ Updated report footer template');

writeFileSync(htmlPath, html);
console.log('\n✅ All changes written to index.html');
