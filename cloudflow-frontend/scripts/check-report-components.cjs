const path = require('node:path');
const Module = require('node:module');
const frontend = path.resolve(__dirname, '..');
const esbuild = require(path.join(frontend, 'node_modules/esbuild'));
const entry = `
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ReportResultView } from '@/components/reports/ReportResultView';
import { ReportFilterEditor } from '@/components/reports/ReportFilterEditor';
const style = { palette: 'PRIMARY', showLegend: true, showValues: true };
const row = { dimension1: 'stage-1', dimension2: null, label1: '<img src=x onerror=alert(1)>', label2: null,
  measure1: '9007199254740993.1201', measure2: null, measure3: null, measure4: null, measure5: null };
const result = { datasetCode: 'CRM_FUNNEL', columns: [
  { key: 'dimension1', field: 'STAGE', title: '阶段', aggregate: null, unit: null },
  { key: 'measure1', field: 'AMOUNT', title: '金额', aggregate: 'SUM', unit: '元' }
], rows: [row], truncated: false, limitRows: 500, startDate: null, endDate: null, snapshotDate: '2026-11-02', description: '局部组件验证' };
let checks = 0;
const check = (label, condition) => { assert.ok(condition, label); checks++; console.log('PASS ' + label); };
const renderResult = (data, type = 'TABLE') => renderToStaticMarkup(<ReportResultView result={data} type={type} style={style} title="组件验证" />);
for (const type of ['BAR', 'LINE', 'PIE', 'FUNNEL', 'TABLE', 'METRIC']) {
  const html = renderResult(result, type);
  check(type + '精确数值与单一数据表', html.includes('9007199254740993.1201') && (html.match(/<table /g) ?? []).length === 1);
  check(type + '标签纯文本与统计单位', !html.includes('<img') && html.includes('&lt;img') && html.includes('金额 · 合计（元）'));
  if (!['TABLE', 'METRIC'].includes(type)) check(type + '公共图表容器', html.includes('role="img"'));
}
check('普通空结果', renderResult({ ...result, rows: [] }).includes('当前权限与筛选范围内暂无数据。'));
check('截断结果', renderResult({ ...result, truncated: true }).includes('结果已截断，图表不代表全部数据。'));
const expense = { ...result, datasetCode: 'OA_EXPENSE', rows: [], missingDates: { claimCount: '2', claimAmount: '50.50', approvedAmount: '30.00', paidAmount: '20.00' } };
const expenseHtml = renderResult(expense);
check('费用空结果保留独立缺日期汇总', expenseHtml.includes('所选日期范围内暂无已补齐费用日期的数据。') && expenseHtml.includes('aria-label="缺费用日期"') && expenseHtml.includes('<dd>2</dd>') && expenseHtml.includes('50.50') && !expenseHtml.includes('<table'));
const fields = [{ code: 'AMOUNT', name: '金额', type: 'NUMBER', dimension: false, aggregates: ['SUM'], operators: ['EQ', 'BETWEEN', 'IN', 'IS_NULL'], unit: '元' }];
const filterHtml = value => renderToStaticMarkup(<ReportFilterEditor fields={fields} value={value} onChange={() => {}} />);
const group = conditions => ({ junction: 'AND', conditions, groups: [] });
check('范围精度保留', filterHtml(group([{ field: 'AMOUNT', operator: 'BETWEEN', values: ['0.0001', '9007199254740993.1201'] }])).includes('value="9007199254740993.1201"'));
check('未填写不显示值输入', !filterHtml(group([{ field: 'AMOUNT', operator: 'IS_NULL', values: [] }])).includes('<input'));
check('列表超过100值有明确提示', filterHtml(group([{ field: 'AMOUNT', operator: 'IN', values: Array.from({ length: 101 }, (_, i) => String(i)) }])).includes('列表最多100个值，请删减后查询。'));
const condition = { field: 'AMOUNT', operator: 'EQ', values: ['1'] };
const full = { junction: 'AND', conditions: Array.from({ length: 19 }, () => condition), groups: [group([condition])] };
const fullHtml = filterHtml(full);
const addButtons = [...fullHtml.matchAll(/<button[^>]*>添加条件(?:子组)?<\\/button>/g)].map(match => match[0]);
check('20条件禁用各层添加且子组不再添加第三层', addButtons.length === 3 && addButtons.every(button => button.includes('disabled=""')) && (fullHtml.match(/添加条件子组/g) ?? []).length === 1);
console.log('REPORT_STATIC_CHECKS=' + checks);
`;
(async () => {
  const build = await esbuild.build({ stdin: { contents: entry, loader: 'tsx', sourcefile: 'report-static-check.tsx', resolveDir: frontend },
    absWorkingDir: frontend, tsconfig: path.join(frontend, 'tsconfig.json'), bundle: true, platform: 'node', format: 'cjs',
    write: false, outfile: path.join(__dirname, 'render.cjs'), define: { 'import.meta.env': JSON.stringify({ BASE_URL: '/', DEV: false, PROD: true, MODE: 'production' }) },
    logLevel: 'silent' });
  const runtime = new Module(path.join(frontend, 'report-static-check.cjs'));
  runtime.filename = path.join(frontend, 'report-static-check.cjs');
  runtime.paths = Module._nodeModulePaths(frontend);
  // Only the API module's online/offline listeners need a window during server rendering; no DOM or canvas is simulated.
  global.window = { addEventListener() {}, removeEventListener() {}, location: { href: 'http://localhost/', origin: 'http://localhost' } };
  runtime._compile(build.outputFiles.find(file => file.path.endsWith('.cjs')).text, runtime.filename);
})().catch(error => { console.error(error); process.exitCode = 1; });
