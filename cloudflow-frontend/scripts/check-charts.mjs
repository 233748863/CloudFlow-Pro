import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];
let chartFiles = 0;
async function scan(directory) {
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) { await scan(file); continue; }
    if (!/\.(tsx?|css)$/.test(file)) continue;
    const source = await fs.readFile(file, 'utf8');
    const relative = path.relative(root, file).replaceAll('\\', '/');
    const isChart = relative.startsWith('src/components/charts/') || /from\s+['"][^'"]*(?:components\/charts|echarts)/.test(source)
      || /(?:dashboard-chart|UserDashboardCharts)\.css$/.test(relative);
    if (!isChart) continue;
    chartFiles++;
    if (file.endsWith('.css')) {
      if (/#[\da-f]{3}(?:[\da-f]{3})?\b/i.test(source)) failures.push(`${relative}: 图表样式禁止硬编码十六进制颜色`);
      continue;
    }
    const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    function visit(node) {
      if ((ts.isStringLiteralLike(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) && /#[\da-f]{3}(?:[\da-f]{3})?\b/i.test(node.text)) {
        failures.push(`${relative}:${ast.getLineAndCharacterOfPosition(node.getStart()).line + 1}: 图表禁止硬编码十六进制颜色`);
      }
      if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier) && /^echarts(?:\/|$)/.test(node.moduleSpecifier.text)
        && !node.importClause?.isTypeOnly && relative !== 'src/components/charts/Chart.tsx') failures.push(`${relative}: 运行时 ECharts 必须使用统一封装`);
      ts.forEachChild(node, visit);
    }
    visit(ast);
  }
}
await scan(path.join(root, 'src'));
if (failures.length) { failures.forEach(value => console.error(value)); process.exitCode = 1; }
else console.log(`CHART_SOURCE_CHECK: files=${chartFiles}; hardcoded_hex=0; direct_echarts_bypass=0`);
