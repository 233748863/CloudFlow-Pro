import request from './request';
import { getErrorMessage } from '@/utils/errorMessage';

export type ReportId = string | number;
export type ChartType = 'BAR' | 'LINE' | 'PIE' | 'FUNNEL' | 'TABLE' | 'METRIC';
export type ReportValue = string | number;
export interface ReportField { code: string; name: string; type: 'TEXT' | 'NUMBER' | 'ID' | 'DATE'; dimension: boolean; aggregates: string[]; operators: string[]; unit: string | null }
export interface ReportFilter { field: string; operator: string; values: ReportValue[] }
export interface ReportFilterGroup { junction: 'AND' | 'OR'; conditions: ReportFilter[]; groups: ReportFilterGroup[] }
export interface ReportQuery { dimensions: string[]; measures: { field: string; aggregate: string }[]; filters: ReportFilterGroup | null; sorts: { column: string; direction: 'ASC' | 'DESC' }[]; limitRows: number; startDate: string | null; endDate: string | null }
export interface ReportStyle { palette: 'PRIMARY' | 'SUCCESS' | 'WARNING' | 'NEUTRAL'; showLegend: boolean; showValues: boolean }
export interface ReportDataset { datasetId: ReportId; definition: { code: string; name: string; description: string; timeBased: boolean; fields: ReportField[]; unitPartition: string | null }; availability: string; message: string }
export interface ReportChart { chartId: ReportId; version: number; name: string; type: ChartType; datasetCode: string; query: ReportQuery; style: ReportStyle; ownerId: ReportId; shareScope: ShareScope; editable: boolean; availability: string }
export interface ReportChartInput { chartId?: string; version?: number; name: string; type: ChartType; datasetCode: string; query: ReportQuery; style: ReportStyle }
export interface ReportLayoutItem { chartId: ReportId; gridX: number; gridY: number; gridW: number; gridH: number }
export interface ReportDashboardItem extends ReportLayoutItem { chart: ReportChart | null; availability: string }
export interface ReportDashboard { dashboardId: ReportId; version: number; name: string; remark: string | null; ownerId: ReportId; shareScope: ShareScope; editable: boolean; items: ReportDashboardItem[] }
export interface ReportDashboardInput { dashboardId?: string; version?: number; name: string; remark: string; items: (Omit<ReportLayoutItem, 'chartId'> & { chartId: string })[] }
export type ShareScope = 'PRIVATE' | 'DEPT' | 'TENANT';
export interface ReportColumn { key: string; field: string; title: string; aggregate: string | null; unit: string | null }
export interface ReportRow { dimension1: string | null; dimension2: string | null; label1: string | null; label2: string | null; measure1: string | null; measure2: string | null; measure3: string | null; measure4: string | null; measure5: string | null }
export interface ReportMissingDates { claimCount: string; claimAmount: string; approvedAmount: string; paidAmount: string }
export interface ReportResult { datasetCode: string; columns: ReportColumn[]; rows: ReportRow[]; truncated: boolean; limitRows: number; startDate: string | null; endDate: string | null; snapshotDate: string; description: string; missingDates?: ReportMissingDates | null }
export interface ReportPage<Row> { rows: Row[]; total: number; pageNum: number; pageSize: number }

const base = '/auth/system/report';
const idPath = (id: ReportId) => encodeURIComponent(String(id));
export const listReportDatasets = (signal?: AbortSignal) => request.get<ReportDataset[]>(`${base}/dataset/list`, { signal, silent: true });
export const queryReport = async (code: string, query: ReportQuery, signal?: AbortSignal): Promise<ReportResult> => {
  const result = await request.post<unknown>(`${base}/dataset/${encodeURIComponent(code)}/query`, query, { signal, silent: true, timeout: 10000 });
  if (!validReportResult(result, code, query)) throw new Error('统计结果格式异常，请重新查询或联系管理员核对。');
  return result;
};
export const listReportCharts = (pageNum = 1, signal?: AbortSignal) => request.get<ReportPage<ReportChart>>(`${base}/chart/list`, { params: { pageNum, pageSize: 20 }, signal, silent: true });
export const getReportChart = (id: ReportId, signal?: AbortSignal) => request.get<ReportChart>(`${base}/chart/${idPath(id)}`, { signal, silent: true });
export const saveReportChart = (input: ReportChartInput) => input.chartId ? request.put<ReportId>(`${base}/chart`, input, { silent: true }) : request.post<ReportId>(`${base}/chart`, input, { silent: true });
export const removeReportChart = (id: ReportId, version: number) => request.delete<void>(`${base}/chart/${idPath(id)}`, { params: { version }, silent: true });
export const listReportDashboards = (pageNum = 1, signal?: AbortSignal) => request.get<ReportPage<ReportDashboard>>(`${base}/dashboard/list`, { params: { pageNum, pageSize: 20 }, signal, silent: true });
export const getReportDashboard = (id: ReportId, signal?: AbortSignal) => request.get<ReportDashboard>(`${base}/dashboard/${idPath(id)}`, { signal, silent: true });
export const saveReportDashboard = (input: ReportDashboardInput) => input.dashboardId ? request.put<ReportId>(`${base}/dashboard`, input, { silent: true }) : request.post<ReportId>(`${base}/dashboard`, input, { silent: true });
export const removeReportDashboard = (id: ReportId, version: number) => request.delete<void>(`${base}/dashboard/${idPath(id)}`, { params: { version }, silent: true });
export const shareReport = (kind: 'CHART' | 'DASHBOARD', id: ReportId, scope: ShareScope, version: number) => request.post<void>(`${base}/share`, { kind, id: String(id), scope, version }, { silent: true });
export const reportError = (error: unknown) => getErrorMessage(error, '操作失败，请刷新后核对实际结果');
export const chartTypeNames: Record<ChartType, string> = { BAR: '柱状图', LINE: '折线图', PIE: '饼图', FUNNEL: '漏斗图', TABLE: '数据表', METRIC: '指标卡' };
export const shareScopeNames: Record<ShareScope, string> = { PRIVATE: '仅本人', DEPT: '所属部门', TENANT: '本企业' };
export const aggregateNames: Record<string, string> = { SUM: '合计', COUNT: '计数', AVG: '平均', MAX: '最大', MIN: '最小' };

function validReportResult(value: unknown, code: string, query: ReportQuery): value is ReportResult {
  const record = (candidate: unknown): candidate is Record<string, unknown> => candidate !== null && typeof candidate === 'object' && !Array.isArray(candidate);
  const nullableText = (candidate: unknown) => candidate === null || typeof candidate === 'string';
  const date = (candidate: unknown) => typeof candidate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(candidate);
  const nullableDate = (candidate: unknown) => candidate === null || date(candidate);
  const decimal = (candidate: unknown) => candidate === null || typeof candidate === 'string' && /^-?\d+(?:\.\d+)?$/.test(candidate);
  if (!record(value) || value.datasetCode !== code || !Array.isArray(value.columns) || !Array.isArray(value.rows)
    || typeof value.truncated !== 'boolean' || value.limitRows !== query.limitRows || value.rows.length > query.limitRows
    || !nullableDate(value.startDate) || !nullableDate(value.endDate) || !date(value.snapshotDate) || typeof value.description !== 'string') return false;
  const missingDates = value.missingDates;
  if (code === 'OA_EXPENSE') {
    if (!record(missingDates) || typeof missingDates.claimCount !== 'string' || !/^\d+$/.test(missingDates.claimCount)
      || !['claimAmount', 'approvedAmount', 'paidAmount'].every(key => typeof missingDates[key] === 'string' && decimal(missingDates[key]))) return false;
  } else if (missingDates != null) return false;
  const expectedColumns = [...query.dimensions.map((field, index) => ({ key: `dimension${index + 1}`, field, aggregate: null })),
    ...query.measures.map((measure, index) => ({ key: `measure${index + 1}`, field: measure.field, aggregate: measure.aggregate }))];
  return value.columns.length === expectedColumns.length && value.columns.every((column, index) => record(column)
    && column.key === expectedColumns[index].key && column.field === expectedColumns[index].field && column.aggregate === expectedColumns[index].aggregate
    && typeof column.title === 'string' && nullableText(column.unit)) && value.rows.every(row => record(row)
      && ['dimension1', 'dimension2', 'label1', 'label2'].every(key => nullableText(row[key]))
      && ['measure1', 'measure2', 'measure3', 'measure4', 'measure5'].every(key => decimal(row[key])));
}

export function defaultReportQuery(dataset: ReportDataset): ReportQuery {
  const fields = dataset.definition.fields;
  const measure = fields.find(field => field.aggregates.length > 0);
  const dimension = dataset.definition.unitPartition ?? fields.find(field => field.dimension)?.code;
  return { dimensions: dimension ? [dimension] : [], measures: measure ? [{ field: measure.code, aggregate: measure.aggregates[0] }] : [], filters: null, sorts: [], limitRows: 500, startDate: null, endDate: null };
}

export function layoutConflict(items: ReportLayoutItem[]): boolean {
  return items.some((left, index) => items.slice(index + 1).some(right => String(left.chartId) === String(right.chartId)
    || left.gridX < right.gridX + right.gridW && right.gridX < left.gridX + left.gridW && left.gridY < right.gridY + right.gridH && right.gridY < left.gridY + left.gridH));
}
