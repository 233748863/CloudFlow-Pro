import React, { useEffect, useMemo, useState } from 'react';
import { getConfigIntSync } from '../hooks/useSystemConfig';
import { SYS_PAGE_DEFAULT_PAGE_SIZE } from '../constants/sysConfig';
import { Gauge, Goal, RefreshCcw, Search, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  Button,
  DeptSelector,
  Input,
  Label,
  LoadingSpinner,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
  UserSelector,
} from '@/components/common';
import { BaseDialog } from '@/components/common/BaseDialog';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { Pagination } from '@/components/common/Pagination';
import { InnerTableSurface, TablePageLayout } from '@/components/layout/TablePageLayout';
import { CrmSalesTarget, crmApi } from '@/services/api/crm';
import { formatDateTimeDisplay } from '@/utils/dateFormat';
import { getErrorMessage } from '@/utils/errorMessage';
import { getCrmGenericStatusLabel } from '@/utils/enumLabels';
import { useDict } from '@/hooks/useDict';

const statusOptions = ['ACTIVE', 'INACTIVE'];
const dimensionOptions = ['OWNER', 'DEPT'];
const periodTypeOptions = ['MONTH', 'QUARTER', 'YEAR'];

const currentYear = new Date().getFullYear();

const emptySalesTarget: CrmSalesTarget = {
  targetName: '',
  dimensionType: 'OWNER',
  periodType: 'MONTH',
  targetYear: currentYear,
  targetPeriod: new Date().getMonth() + 1,
  targetAmount: 0,
  status: 'ACTIVE',
};

const formatCurrency = (value?: number) => Number(value || 0).toLocaleString('zh-CN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export default function CrmSalesTargetPage() {
  const dimensionDict = useDict('crm_sales_target_dimension');
  const periodTypeDict = useDict('crm_period_type');
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<CrmSalesTarget[]>([]);
  const [pageNum, setPageNum] = useState(1);
  const [total, setTotal] = useState(0);
  const [targetName, setTargetName] = useState('');
  const [dimensionType, setDimensionType] = useState('ALL');
  const [periodType, setPeriodType] = useState('ALL');
  const [targetYear, setTargetYear] = useState(String(currentYear));
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<CrmSalesTarget>(emptySalesTarget);
  const [editing, setEditing] = useState<CrmSalesTarget | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<CrmSalesTarget | null>(null);
  const totalPages = Math.max(1, Math.ceil(total / 10));
  const stats = useMemo(
    () => [
      { label: '目标总数', value: String(total), meta: `当前第 ${pageNum} 页`, icon: <Goal size={18} />, tone: 'blue' },
      { label: '目标金额', value: formatCurrency(rows.reduce((sum, row) => sum + Number(row.targetAmount || 0), 0)), meta: '当前页合计', icon: <Gauge size={18} />, tone: 'green' },
      { label: '实际回款', value: formatCurrency(rows.reduce((sum, row) => sum + Number(row.achievedAmount || 0), 0)), meta: '当前页合计', icon: <Goal size={18} />, tone: 'amber' },
      { label: '分页', value: `${pageNum}/${totalPages}`, meta: `每页 ${getConfigIntSync(SYS_PAGE_DEFAULT_PAGE_SIZE, 10)} 条`, icon: <RefreshCcw size={18} />, tone: 'violet' },
    ],
    [pageNum, rows, total, totalPages],
  );

  const load = async () => {
    setLoading(true);
    try {
      const result = await crmApi.listSalesTargets({
        pageNum,
        pageSize: getConfigIntSync(SYS_PAGE_DEFAULT_PAGE_SIZE, 10),
        targetName: targetName || undefined,
        dimensionType: dimensionType === 'ALL' ? undefined : dimensionType,
        periodType: periodType === 'ALL' ? undefined : periodType,
        targetYear: targetYear ? Number(targetYear) : undefined,
      });
      setRows(result.rows || []);
      setTotal(result.total || 0);
    } catch (error) {
      toast.error(getErrorMessage(error, '加载销售目标失败'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [pageNum, targetName, dimensionType, periodType, targetYear]);

  const saveSalesTarget = async () => {
    try {
      if (editing?.salesTargetId) {
        await crmApi.editSalesTarget({ ...form, salesTargetId: editing.salesTargetId });
        toast.success('销售目标已更新');
      } else {
        await crmApi.addSalesTarget(form);
        toast.success('销售目标已创建');
      }
      setDialogOpen(false);
      setEditing(null);
      setForm(emptySalesTarget);
      await load();
    } catch (error) {
      toast.error(getErrorMessage(error, '保存销售目标失败'));
    }
  };

  const removeSalesTarget = async (salesTarget: CrmSalesTarget) => {
    if (!salesTarget.salesTargetId) return;
    try {
      await crmApi.removeSalesTarget([salesTarget.salesTargetId]);
      toast.success('销售目标已删除');
      setConfirmDelete(null);
      await load();
    } catch (error) {
      toast.error(getErrorMessage(error, '删除销售目标失败'));
    }
  };

  const renderPeriodValuePlaceholder = () => {
    if (form.periodType === 'YEAR') return '年度无需填写';
    if (form.periodType === 'QUARTER') return '填写 1-4';
    return '填写 1-12';
  };

  const pageActions = (
    <>
        <header className="admin-source-header">
          <div>
            <p className="admin-source-kicker">SALES TARGETS</p>
            <h2>销售目标</h2>
            <span>管理个人或部门配额、周期目标、回款完成率和差额</span>
          </div>
          <div className="admin-source-controls">
            <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
              <RefreshCcw size={16} className={loading ? 'animate-spin' : undefined} />
              刷新
            </Button>
            <Button size="sm" onClick={() => { setEditing(null); setForm(emptySalesTarget); setDialogOpen(true); }}>
              <Goal size={16} />
              新增销售目标
            </Button>
          </div>
        </header>

        <section className="admin-source-stat-grid admin-crm-stat-grid">
          {stats.map((stat) => (
            <article key={stat.label} className={`card admin-source-stat admin-source-tone-${stat.tone}`}>
              <div className="admin-source-stat-icon">{stat.icon}</div>
              <div><p>{stat.label}</p><strong>{stat.value}</strong><span>{stat.meta}</span></div>
            </article>
          ))}
        </section>
    </>
  );

  const pageFilters = (
        <section className="card admin-users-toolbar admin-crm-toolbar">
          <div className="admin-users-filter-grid">
            <label className="admin-source-search">
              <span className="input-label">搜索目标</span>
              <div className="admin-source-search-field">
                <Search size={16} />
                <Input className="h-[42px]" value={targetName} onChange={(e) => { setPageNum(1); setTargetName(e.target.value); }} placeholder="目标名称" type="search" />
              </div>
            </label>
            <label>
              <span className="input-label">维度</span>
              <Select value={dimensionType} onValueChange={(value) => { setPageNum(1); setDimensionType(value); }}>
                <SelectTrigger className="h-[42px]"><SelectValue placeholder="维度" /></SelectTrigger>
                <SelectContent><SelectItem value="ALL">全部维度</SelectItem>{dimensionOptions.map((item) => <SelectItem key={item} value={item}>{dimensionDict.getLabel(item)}</SelectItem>)}</SelectContent>
              </Select>
            </label>
            <label>
              <span className="input-label">周期</span>
              <Select value={periodType} onValueChange={(value) => { setPageNum(1); setPeriodType(value); }}>
                <SelectTrigger className="h-[42px]"><SelectValue placeholder="周期" /></SelectTrigger>
                <SelectContent><SelectItem value="ALL">全部周期</SelectItem>{periodTypeOptions.map((item) => <SelectItem key={item} value={item}>{periodTypeDict.getLabel(item)}</SelectItem>)}</SelectContent>
              </Select>
            </label>
            <label>
              <span className="input-label">年份</span>
              <Input value={targetYear} onChange={(e) => { setPageNum(1); setTargetYear(e.target.value); }} placeholder="年份" />
            </label>
            <div className="admin-users-toolbar-actions">
            </div>
          </div>
        </section>
  );

  const pageTable = (
        <InnerTableSurface className="admin-crm-table-panel">
            <table className="unity-data-table admin-source-table admin-crm-table min-w-[1280px]">
              <thead>
                <tr>
                  <th>目标编号</th>
                  <th>目标</th>
                  <th>维度对象</th>
                  <th>周期</th>
                  <th className="text-right">目标金额</th>
                  <th className="text-right">实际回款</th>
                  <th className="text-right">完成率</th>
                  <th className="text-right">差额</th>
                  <th>更新时间</th>
                  <th className="text-right">操作</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={10} className="px-4 py-10 text-center"><LoadingSpinner size="lg" className="mx-auto mb-3" /><span className="text-sm text-cf-subtle">正在加载销售目标...</span></td></tr>
                ) : rows.length === 0 ? (
                  <tr><td colSpan={10} className="px-4 py-10 text-center text-sm text-cf-subtle"><Goal className="mx-auto mb-3 h-4 w-4" />暂无销售目标</td></tr>
                ) : rows.map((row) => (
                  <tr key={row.salesTargetId}>
                    <td className="font-mono text-xs">{row.targetNo || '-'}</td>
                    <td><strong>{row.targetName}</strong><small>{getCrmGenericStatusLabel(row.status)}</small></td>
                    <td><strong>{dimensionDict.getLabel(row.dimensionType || '') || '-'}</strong><small>{row.ownerName || row.deptName || '-'}</small></td>
                    <td><strong>{periodTypeDict.getLabel(row.periodType || '') || '-'}</strong><small>{row.periodLabel || '-'}</small></td>
                    <td className="text-right tabular-nums">{formatCurrency(row.targetAmount)}</td>
                    <td className="text-right tabular-nums">{formatCurrency(row.achievedAmount)}</td>
                    <td className="text-right tabular-nums">{Number(row.completionRate || 0).toFixed(2)}%</td>
                    <td className="text-right tabular-nums">{formatCurrency(row.gapAmount)}</td>
                    <td>{formatDateTimeDisplay(row.updateTime) || '-'}</td>
                    <td><div className="admin-users-row-actions"><button type="button" data-tooltip="编辑目标" aria-label="编辑目标" onClick={() => { setEditing(row); setForm({ ...row }); setDialogOpen(true); }}><Gauge size={15} /></button><button type="button" className="danger" data-tooltip="删除目标" aria-label="删除目标" onClick={() => setConfirmDelete(row)}><Trash2 size={15} /></button></div></td>
                  </tr>
                ))}
              </tbody>
            </table>
        </InnerTableSurface>
  );

  const pagePagination = total > 0
    ? <Pagination total={total} page={pageNum} pageSize={10} showPageSizeSelector={false} showJump={false} onPageChange={setPageNum} onPageSizeChange={() => {}} />
    : null;

  return (
    <>
      <section className="admin-source-page admin-crm-page admin-crm-sales-targets-page">
        <TablePageLayout
          actions={pageActions}
          filters={pageFilters}
          table={pageTable}
          pagination={pagePagination}
        />
      </section>

      <BaseDialog
        open={dialogOpen}
        title={editing ? '编辑销售目标' : '新增销售目标'}
        onClose={() => setDialogOpen(false)}
        width="wide"
        footer={<><Button variant="outline" onClick={() => setDialogOpen(false)}>取消</Button><Button onClick={() => void saveSalesTarget()}>保存</Button></>}
      >
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <div>
            <Label>目标名称</Label>
            <Input value={form.targetName || ''} onChange={(e) => setForm((prev) => ({ ...prev, targetName: e.target.value }))} placeholder="例如：华东大区 5 月回款目标" />
          </div>
          <div>
            <Label>维度类型</Label>
            <Select value={form.dimensionType || 'OWNER'} onValueChange={(value) => setForm((prev) => ({ ...prev, dimensionType: value as CrmSalesTarget['dimensionType'] }))}>
              <SelectTrigger><SelectValue placeholder="选择维度" /></SelectTrigger>
              <SelectContent>
                {dimensionOptions.map((item) => <SelectItem key={item} value={item}>{dimensionDict.getLabel(item)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>周期类型</Label>
            <Select value={form.periodType || 'MONTH'} onValueChange={(value) => setForm((prev) => ({ ...prev, periodType: value as CrmSalesTarget['periodType'], targetPeriod: value === 'YEAR' ? undefined : prev.targetPeriod }))}>
              <SelectTrigger><SelectValue placeholder="选择周期" /></SelectTrigger>
              <SelectContent>
                {periodTypeOptions.map((item) => <SelectItem key={item} value={item}>{periodTypeDict.getLabel(item)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>目标年份</Label>
            <Input type="number" value={String(form.targetYear || currentYear)} onChange={(e) => setForm((prev) => ({ ...prev, targetYear: Number(e.target.value || currentYear) }))} placeholder="目标年份" />
          </div>
          <div>
            <Label>周期值</Label>
            <Input type="number" value={form.targetPeriod == null ? '' : String(form.targetPeriod)} onChange={(e) => setForm((prev) => ({ ...prev, targetPeriod: e.target.value ? Number(e.target.value) : undefined }))} placeholder={renderPeriodValuePlaceholder()} disabled={form.periodType === 'YEAR'} />
          </div>
          <div>
            <Label>目标金额</Label>
            <Input type="number" value={String(form.targetAmount || 0)} onChange={(e) => setForm((prev) => ({ ...prev, targetAmount: Number(e.target.value || 0) }))} placeholder="目标金额" />
          </div>
          {form.dimensionType === 'DEPT' ? (
            <div className="md:col-span-2">
              <Label>部门</Label>
              <DeptSelector
                single
                value={form.deptId ?? null}
                onChange={(id, picked) => setForm((prev) => ({ ...prev, deptId: id ?? undefined, deptName: picked?.deptName || '' }))}
                placeholder="选择部门"
              />
            </div>
          ) : (
            <div className="md:col-span-2">
              <Label>负责人</Label>
              <UserSelector
                single
                value={form.ownerId == null ? null : String(form.ownerId)}
                onChange={(id, picked) => setForm((prev) => ({ ...prev, ownerId: id ? Number(id) : undefined, ownerName: picked?.name || '' }))}
                placeholder="选择负责人，留空默认当前用户"
                allowClear
              />
            </div>
          )}
          <div>
            <Label>状态</Label>
            <Select value={form.status || 'ACTIVE'} onValueChange={(value) => setForm((prev) => ({ ...prev, status: value }))}>
              <SelectTrigger><SelectValue placeholder="选择状态" /></SelectTrigger>
              <SelectContent>
                {statusOptions.map((item) => <SelectItem key={item} value={item}>{getCrmGenericStatusLabel(item)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="md:col-span-2 xl:col-span-3">
            <Label>备注</Label>
            <Textarea value={form.remark || ''} onChange={(e) => setForm((prev) => ({ ...prev, remark: e.target.value }))} placeholder="记录目标口径、区域范围、口径说明等" rows={4} />
          </div>
        </div>
      </BaseDialog>

      <ConfirmDialog
        open={!!confirmDelete}
        title="删除销售目标"
        description={`确定删除销售目标“${confirmDelete?.targetName || ''}”吗？`}
        confirmText="删除"
        tone="danger"
        onCancel={() => setConfirmDelete(null)}
        onConfirm={() => confirmDelete ? void removeSalesTarget(confirmDelete) : undefined}
      />
    </>
  );
}
