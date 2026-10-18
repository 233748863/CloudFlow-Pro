import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { BarChart3, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { Button, DatePicker, Input } from '@/components/common';
import { Chart } from '@/components/charts/Chart';
import { InnerTableSurface, TablePageLayout } from '@/components/layout/TablePageLayout';
import { useAuth } from '@/context/AuthContext';
import { consumableApi } from '@/services/api/consumable';
import { consumableLedgerApi, consumableRequestApi, type ConsumableCatalogItem, type ConsumableCategory, type ConsumablePageResult, type ConsumableQuery, type ConsumableReportRow } from '@/services/api/consumableLedger';
import { getErrorMessage } from '@/utils/errorMessage';
import { ConsumableField, ConsumablePagination, ConsumablePicker, ConsumableSelect, ConsumableTableState, dateWindow, moneyText, today, useConsumablePage } from './consumable/consumableUi';

type ReportKind = 'stock' | 'usage' | 'cost' | 'warning';
interface ReportItem extends ConsumableReportRow { currentQuantity?: string; lowStockThreshold?: string; targetStock?: string; status?: string }
interface Column { key: keyof ReportItem; label: string; money?: boolean }
const identity = (row: ReportItem) => `${row.consumableId}:${row.deptId ?? ''}:${row.beneficiaryId ?? ''}:${row.unit}`;

function ReportWorkspace() {
  const { hasPermission } = useAuth();
  const costAllowed = hasPermission('oa:consumable-report:cost');
  const [kind, setKind] = useState<ReportKind>('stock');
  const [filter, setFilter] = useState({ from: `${today().slice(0, 7)}-01`, to: today(), consumableId: '', categoryId: '', deptId: '', applicantId: '', groupBy: 'CONSUMABLE' as ConsumableQuery['groupBy'] });
  const [query, setQuery] = useState<ConsumableQuery>({ ...dateWindow(filter.from, filter.to), pageNum: 1, pageSize: 10 });
  const [material, setMaterial] = useState<ConsumableCatalogItem | null>(null);
  const [categories, setCategories] = useState<ConsumableCategory[]>([]);
  const [chartKey, setChartKey] = useState('');
  useEffect(() => {
    if (hasPermission(['oa:consumable:list', 'oa:consumable-request:lookup'])) consumableRequestApi.categories().then(setCategories).catch((failure) => toast.error(getErrorMessage(failure, '分类目录加载失败')));
  }, [hasPermission]);
  const loader = useCallback(async (): Promise<ConsumablePageResult<ReportItem>> => {
    if (kind !== 'warning') return consumableLedgerApi.report(kind, query);
    const all = await consumableApi.getLowStock();
    const filtered = all.filter((item) => (!query.consumableId || String(item.consumableId) === query.consumableId) && (!query.categoryId || String(item.categoryId) === query.categoryId));
    const offset = ((query.pageNum ?? 1) - 1) * 10;
    return { rows: filtered.slice(offset, offset + 10).map((item) => ({ consumableId: String(item.consumableId), name: item.name, unit: item.unit ?? '', currentQuantity: String(item.quantity), lowStockThreshold: String(item.lowStockThreshold), targetStock: item.targetStock == null ? undefined : String(item.targetStock), status: item.status })), total: filtered.length, pageNum: query.pageNum ?? 1, pageSize: 10 };
  }, [kind, query]);
  const { data, loading, error, refresh } = useConsumablePage<ReportItem>(loader);
  const columns = useMemo<Column[]>(() => {
    if (kind === 'warning') return [{ key: 'currentQuantity', label: '当前库存' }, { key: 'lowStockThreshold', label: '低库存阈值' }, { key: 'targetStock', label: '目标库存' }];
    if (kind === 'cost') return [{ key: 'openingAmount', label: '期初库存成本', money: true }, { key: 'inboundCost', label: '入库成本', money: true }, { key: 'issuedAmount', label: '发料成本', money: true }, { key: 'returnedAmount', label: '退回成本', money: true }, { key: 'netAmount', label: '净领用成本', money: true }, { key: 'scrapAmount', label: '报废成本', money: true }, { key: 'adjustAmount', label: '盘点成本变化', money: true }, { key: 'closingAmount', label: '期末库存成本', money: true }];
    if (kind === 'usage') return [{ key: 'issuedQuantity', label: '发料量' }, { key: 'returnedQuantity', label: '退回量' }, { key: 'netQuantity', label: '净领用量' }, ...(costAllowed ? [{ key: 'issuedAmount' as const, label: '发料成本', money: true }, { key: 'returnedAmount' as const, label: '退回成本', money: true }, { key: 'netAmount' as const, label: '净领用成本', money: true }] : [])];
    return [{ key: 'openingQuantity', label: '期初' }, { key: 'inboundQuantity', label: '流入' }, { key: 'outboundQuantity', label: '流出' }, { key: 'closingQuantity', label: '期末' }, ...(costAllowed ? [{ key: 'openingAmount' as const, label: '期初成本', money: true }, { key: 'inboundAmount' as const, label: '流入成本', money: true }, { key: 'outboundAmount' as const, label: '流出成本', money: true }, { key: 'closingAmount' as const, label: '期末成本', money: true }] : [])];
  }, [kind, costAllowed]);
  const graphRow = data.rows.find((row) => identity(row) === chartKey) ?? data.rows[0];
  const numericColumns = columns.filter((column) => !column.money);
  const safeChart = graphRow && numericColumns.length > 0 && numericColumns.every((column) => graphRow[column.key] != null && /^-?\d+$/.test(String(graphRow[column.key])) && Number.isSafeInteger(Number(graphRow[column.key])));
  const apply = () => {
    try {
      if (filter.deptId && !/^[1-9]\d*$/.test(filter.deptId) || filter.applicantId && !/^[1-9]\d*$/.test(filter.applicantId)) throw new Error('部门和领用人编号必须为正整数');
      setQuery({ ...dateWindow(filter.from, filter.to), consumableId: filter.consumableId || undefined, categoryId: kind === 'usage' ? undefined : filter.categoryId || undefined, deptId: filter.deptId || undefined, applicantId: filter.applicantId || undefined, groupBy: filter.groupBy, pageNum: 1, pageSize: 10 });
    } catch (failure) { toast.error(getErrorMessage(failure, '筛选条件无效')); }
  };
  const tabs: { value: ReportKind; label: string; visible: boolean }[] = [{ value: 'stock', label: '进出存', visible: true }, { value: 'usage', label: '领用统计', visible: true }, { value: 'cost', label: '成本', visible: costAllowed }, { value: 'warning', label: '低库存', visible: hasPermission('oa:consumable:list') }];
  return <section className="admin-source-page consumable-reports-page"><TablePageLayout
    actions={<header className="admin-source-header"><div><p className="admin-source-kicker">CONSUMABLE REPORTS</p><h2 className="flex items-center gap-2"><BarChart3 size={22} />耗材报表</h2><span>按耗材与单位核对进出存；人员领用统计遵循授权范围</span></div><Button variant="outline" onClick={() => void refresh()} disabled={loading}><RefreshCw size={16} />刷新</Button></header>}
    filters={<section className="card space-y-4 p-4"><nav className="flex flex-wrap gap-2" aria-label="耗材报表类型">{tabs.filter((tab) => tab.visible).map((tab) => <Button key={tab.value} variant={kind === tab.value ? 'default' : 'outline'} aria-pressed={kind === tab.value} onClick={() => { setKind(tab.value); setQuery((previous) => ({ ...previous, pageNum: 1, categoryId: tab.value === 'usage' ? undefined : previous.categoryId })); setChartKey(''); }}>{tab.label}</Button>)}</nav>
      <div className="grid items-end gap-4 sm:grid-cols-2 lg:grid-cols-3"><ConsumableField label="开始日期"><DatePicker type="date" value={filter.from} disabled={kind === 'warning'} onChange={(event) => setFilter((previous) => ({ ...previous, from: event.target.value }))} /></ConsumableField><ConsumableField label="结束日期（含当日）"><DatePicker type="date" value={filter.to} disabled={kind === 'warning'} onChange={(event) => setFilter((previous) => ({ ...previous, to: event.target.value }))} /></ConsumableField><ConsumableField label="耗材">{hasPermission(['oa:consumable:list', 'oa:consumable-request:lookup']) ? <ConsumablePicker management={hasPermission('oa:consumable:list')} value={material} onSelect={(item) => { setMaterial(item); setFilter((previous) => ({ ...previous, consumableId: item.consumableId })); }} /> : <Input value={filter.consumableId} onChange={(event) => setFilter((previous) => ({ ...previous, consumableId: event.target.value }))} placeholder="耗材编号" />}</ConsumableField>
        {kind !== 'usage' && <ConsumableField label="耗材分类"><ConsumableSelect label="耗材分类" value={filter.categoryId} onChange={(value) => setFilter((previous) => ({ ...previous, categoryId: value }))} options={[{ value: '', label: '全部分类' }, ...categories.map((category) => ({ value: category.categoryId, label: category.label }))]} /></ConsumableField>}
        {kind === 'usage' && <ConsumableField label="领用分组"><ConsumableSelect label="领用分组" value={filter.groupBy ?? 'CONSUMABLE'} onChange={(value) => setFilter((previous) => ({ ...previous, groupBy: value as ConsumableQuery['groupBy'] }))} options={[{ value: 'CONSUMABLE', label: '按耗材 / 单位' }, { value: 'DEPARTMENT', label: '按部门及耗材 / 单位' }, { value: 'PERSON', label: '按领用人及耗材 / 单位' }]} /></ConsumableField>}
        {(kind === 'usage' || kind === 'cost') && <><ConsumableField label="部门编号（缩小授权范围）"><Input value={filter.deptId} onChange={(event) => setFilter((previous) => ({ ...previous, deptId: event.target.value }))} /></ConsumableField><ConsumableField label="领用人用户编号（可选）"><Input value={filter.applicantId} onChange={(event) => setFilter((previous) => ({ ...previous, applicantId: event.target.value }))} /></ConsumableField></>}
      </div><div className="flex flex-wrap items-center gap-3"><Button onClick={apply}>查询报表</Button><Button variant="outline" onClick={() => { setMaterial(null); setFilter((previous) => ({ ...previous, consumableId: '', categoryId: '', deptId: '', applicantId: '' })); setQuery((previous) => ({ ...previous, consumableId: undefined, categoryId: undefined, deptId: undefined, applicantId: undefined, pageNum: 1 })); }}>清除对象筛选</Button><span className="text-xs text-cf-subtle">{kind === 'warning' ? '预警为当前库存清单，以库存 ≤ 阈值判断，不使用历史日期。' : '库存数量不跨单位合计；金额仅展示服务端已计算结果。'}</span></div>
    </section>}
    table={<InnerTableSurface><table className="unity-data-table admin-source-table min-w-[1000px]"><thead><tr><th>耗材</th><th>单位</th>{kind === 'usage' && query.groupBy === 'DEPARTMENT' && <th>归属部门</th>}{kind === 'usage' && query.groupBy === 'PERSON' && <th>实际领用人</th>}{columns.map((column) => <th key={column.key}>{column.label}</th>)}<th>查看</th></tr></thead><tbody><ConsumableTableState columns={columns.length + 4} loading={loading} error={error} empty={!data.rows.length} onRetry={() => void refresh()} />{!loading && !error && data.rows.map((row) => <tr key={identity(row)}><td className="font-medium">{row.name}{row.status === 'INACTIVE' && <span className="ml-2 text-xs text-cf-subtle">已停用</span>}</td><td>{row.unit}</td>{kind === 'usage' && query.groupBy === 'DEPARTMENT' && <td>{row.deptName || '—'}</td>}{kind === 'usage' && query.groupBy === 'PERSON' && <td>{row.beneficiaryName || '—'}</td>}{columns.map((column) => <td key={column.key}>{row[column.key] == null ? '—' : column.money ? moneyText(String(row[column.key])) : row[column.key]}</td>)}<td><div className="flex gap-2">{kind !== 'cost' && <Button variant="ghost" size="sm" onClick={() => setChartKey(identity(row))}>数量图</Button>}{hasPermission('oa:consumable-ledger:list') && <Link className="self-center text-sm underline" to={`/admin/consumable-ledger?consumableId=${row.consumableId}`}>台账</Link>}</div></td></tr>)}</tbody></table></InnerTableSurface>}
    pagination={<ConsumablePagination total={data.total} page={query.pageNum ?? 1} onChange={(pageNum) => setQuery((previous) => ({ ...previous, pageNum }))} />} />
    {!loading && !error && safeChart && <section className="card mt-5 p-4"><h3 className="text-sm font-medium">{graphRow.name} · 数量（{graphRow.unit}）{graphRow.deptName ? ` · ${graphRow.deptName}` : ''}{graphRow.beneficiaryName ? ` · ${graphRow.beneficiaryName}` : ''}</h3><Chart seriesCount={1} dataTable={{ columns: ['分项', `数量（${graphRow.unit}）`], rows: numericColumns.map(column => [column.label, String(graphRow[column.key])]) }} ariaLabel={`${graphRow.name}分项数量`} style={{ height: 260 }} option={{ tooltip: { trigger: 'axis' }, grid: { left: 56, right: 24, bottom: 40, top: 30 }, xAxis: { type: 'category', data: numericColumns.map((column) => column.label) }, yAxis: { type: 'value', minInterval: 1 }, series: [{ type: 'bar', data: numericColumns.map((column) => Number(graphRow[column.key])), barMaxWidth: 40 }] }} /></section>}
    {!loading && graphRow && numericColumns.length > 0 && !safeChart && <p className="mt-3 text-xs text-cf-subtle">累计数量超出图表安全整数范围或缺少数据；请以表格中的完整数值为准。</p>}
  </section>;
}

export default function ConsumableReportsPage() {
  const { hasPermission } = useAuth();
  return hasPermission('oa:consumable-report:list') ? <ReportWorkspace /> : <p role="alert" className="p-6 text-cf-subtle">无耗材报表查看权限。</p>;
}
