/**
 * 拆分 index.html 为模块化结构（PWA 版本）
 * 
 * 输入：../index.html（browser-app 分支的单文件）
 * 输出：
 *   ../css/main.css
 *   ../js/parsers.js（VFS + parseXxx 函数）
 *   ../js/report.js（generateReport + CHART_JS_DATA）
 *   ../js/app.js（主入口，handleFile + 初始化）
 *   ../lib/pako.min.js
 *   ../lib/sql.js + sql-wasm.wasm
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const indexPath = path.join(ROOT, 'index.html');

if (!fs.existsSync(indexPath)) {
  console.error('index.html not found');
  process.exit(1);
}

const html = fs.readFileSync(indexPath, 'utf-8');

// 1. 提取 CSS
const cssMatch = html.match(/<style>\n([\s\S]+?)\n<\/style>/);
if (cssMatch) {
  const cssPath = path.join(ROOT, 'css', 'main.css');
  fs.writeFileSync(cssPath, cssMatch[1]);
  console.log('✅ css/main.css');
}

// 2. 提取 pako（第一个 script）
const pakoMatch = html.match(/<script>\/\*! pako 2\.1\.0[\s\S]+?<\/script>\n/);
if (pakoMatch) {
  const pakoPath = path.join(ROOT, 'lib', 'pako.min.js');
  // 去掉 <script> 和 </script> 标签
  const pakoCode = pakoMatch[0].replace(/^<script>/, '').replace(/<\/script>\n$/, '');
  fs.writeFileSync(pakoPath, pakoCode);
  console.log('✅ lib/pako.min.js');
}

// 3. 提取 sql.js（第二个 script，包含 WASM）
const sqlMatch = html.match(/<script>\n\/\/ We are modularizing[\s\S]+?<\/script>\n<script>/);
if (sqlMatch) {
  const sqlPath = path.join(ROOT, 'lib', 'sql.js');
  // 去掉 <script> 和结尾
  let sqlCode = sqlMatch[0].replace(/^<script>\n/, '').replace(/<\/script>\n<script>$/, '');
  fs.writeFileSync(sqlPath, sqlCode);
  console.log('✅ lib/sql.js');
}

console.log('\n拆分完成！');
