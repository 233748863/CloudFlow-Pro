import React, { useEffect, useState } from 'react';
import { getConfigIntSync } from '../hooks/useSystemConfig';
import { SYS_PAGE_DEFAULT_PAGE_SIZE } from '../constants/sysConfig';
import { Gauge, Goal, RefreshCcw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  Button,
  DeptSelector,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  TableActionHead,
  TableHead,
  TableHeader,
  Textarea,
  UserSelector,
} from '@/components/common';
import { BaseDialog } from '@/components/common/BaseDialog';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { Pagination } from '@/components/common/Pagination';
import { TableRowActions } from '@/components/common/table-row-actions';
import { TablePageLayout, TableSurfaceCard } from '@/components/layout/TablePageLayout';
import { CrmSalesTarget, crmApi } from '@/services/api/crm';
import { formatDateTimeDisplay } from '@/utils/dateFormat';
import { getErrorMessage } from '@/utils/errorMessage';
import { getCrmGenericStatusLabel } from '@/utils/enumLabels';

const dimensionLabelMap: Record<string, string> = {
  OWNER: '个人',
  DEPT: '部门',
};

const periodTypeLabelMap: Record<string, string> = {
  MONTH: '月度',
  QUARTER: '季度',
  YEAR: '年度',
};

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

  return (
    <div className="space-y-4 animate-fade-in">
      <TablePageLayout
        filters={(
          <div className="cf-filter-bar">
            <div className="flex flex-1 flex-wrap items-center gap-3">
              <Input value={targetName} onChange={(e) => { setPageNum(1); setTargetName(e.target.value); }} placeholder="目标名称" className="w-full sm:w-[220px]" />
              <div className="w-full sm:w-[160px]">
                <Select value={dimensionType} onValueChange={(value) => { setPageNum(1); setDimensionType(value); }}>
                  <SelectTrigger><SelectValue placeholder="维度" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">全部维度</SelectItem>
                    {dimensionOptions.map((item) => <SelectItem key={item} value={item}>{dimensionLabelMap[item]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="w-full sm:w-[160px]">
                <Select value={periodType} onValueChange={(value) => { setPageNum(1); setPeriodType(value); }}>
                  <SelectTrigger><SelectValue placeholder="周期" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">全部周期</SelectItem>
                    {periodTypeOptions.map((item) => <SelectItem key={item} value={item}>{periodTypeLabelMap[item]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <Input value={targetYear} onChange={(e) => { setPageNum(1); setTargetYear(e.target.value); }} placeholder="年份" className="w-full sm:w-[140px]" />
              <div className="text-xs text-slate-500">第 {pageNum} / {totalPages} 页，共 {total} 条</div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => void load()}><RefreshCcw size={14} className="mr-1.5" />刷新</Button>
              <Button size="sm" onClick={() => { setEditing(null); setForm(emptySalesTarget); setDialogOpen(true); }}><Goal size={14} className="mr-1.5" />新增销售目标</Button>
            </div>
          </div>
        )}
        table={(
          <TableSurfaceCard>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1280px]">
                <TableHeader>
                  <tr>
                    <TableHead>目标编号</TableHead>
                    <TableHead>目标</TableHead>
                    <TableHead>维度对象</TableHead>
                    <TableHead>周期</TableHead>
                    <TableHead>目标金额</TableHead>
                    <TableHead>实际回款</TableHead>
                    <TableHead>完成率</TableHead>
                    <TableHead>差额</TableHead>
                    <TableHead>更新时间</TableHead>
                    <TableActionHead>操作</TableActionHead>
                  </tr>
                </TableHeader>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {rows.map((row) => (
                    <tr key={row.salesTargetId}>
                      <td className="px-4 py-3 text-sm">{row.targetNo || '-'}</td>
                      <td className="px-4 py-3 text-sm"><div>{row.targetName}</div><div className="text-xs text-slate-500">{getCrmGenericStatusLabel(row.status)}</div></td>
                      <td className="px-4 py-3 text-sm"><div>{dimensionLabelMap[row.dimensionType || ''] || row.dimensionType || '-'}</div><div className="text-xs text-slate-500">{row.ownerName || row.deptName || '-'}</div></td>
                      <td className="px-4 py-3 text-sm"><div>{periodTypeLabelMap[row.periodType || ''] || row.periodType || '-'}</div><div className="text-xs text-slate-500">{row.periodLabel || '-'}</div></td>
                      <td className="px-4 py-3 text-right text-sm tabular-nums">{formatCurrency(row.targetAmount)}</td>
                      <td className="px-4 py-3 text-right text-sm tabular-nums">{formatCurrency(row.achievedAmount)}</td>
                      <td className="px-4 py-3 text-right text-sm tabular-nums">{Number(row.completionRate || 0).toFixed(2)}%</td>
                      <td className="px-4 py-3 text-right text-sm tabular-nums">{formatCurrency(row.gapAmount)}</td>
                      <td className="px-4 py-3 text-sm">{formatDateTimeDisplay(row.updateTime) || '-'}</td>
                      <td className="px-4 py-3 text-right">
                        <TableRowActions
                          align="end"
                          overflowLabel="更多"
                          actions={[
                            { label: '编辑目标', icon: <Gauge size={14} />, onClick: () => { setEditing(row); setForm({ ...row }); setDialogOpen(true); }, semantic: 'edit', isPrimary: true, permissionKey: 'crm:sales-target:edit' },
                            { label: '删除目标', icon: <Trash2 size={14} />, onClick: () => setConfirmDelete(row), semantic: 'delete', danger: true, permissionKey: 'crm:sales-target:remove' },
                          ]}
                        />
                      </td>
                    </tr>
                  ))}
                  {!loading && rows.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="px-4 py-16 text-center text-sm text-slate-500">
                        <Goal className="mx-auto mb-3 h-4 w-4" />
                        暂无销售目标。下一步操作：先维护部门或个人配额，再与 HR 绩效看板中的销售业绩对照完成率。
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </TableSurfaceCard>
        )}
        pagination={total > 0 ? <Pagination total={total} page={pageNum} pageSize={10} showPageSizeSelector={false} showJump={false} onPageChange={setPageNum} onPageSizeChange={() => {}} /> : null}
      />

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
                {dimensionOptions.map((item) => <SelectItem key={item} value={item}>{dimensionLabelMap[item]}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>周期类型</Label>
            <Select value={form.periodType || 'MONTH'} onValueChange={(value) => setForm((prev) => ({ ...prev, periodType: value as CrmSalesTarget['periodType'], targetPeriod: value === 'YEAR' ? undefined : prev.targetPeriod }))}>
              <SelectTrigger><SelectValue placeholder="选择周期" /></SelectTrigger>
              <SelectContent>
                {periodTypeOptions.map((item) => <SelectItem key={item} value={item}>{periodTypeLabelMap[item]}</SelectItem>)}
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
    </div>
  );
}
