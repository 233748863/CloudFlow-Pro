import React, { useEffect, useMemo, useState } from 'react';
import { Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { getErrorMessage } from '@/utils/errorMessage';
import {
  BaseDialog,
  Button,
  ConfirmDialog,
  Input,
  LoadingSpinner,
  Pagination,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Table,
  TableActionHead,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableRowActions,
  Textarea,
} from '@/components/common';
import { TablePageLayout, TableSurfaceCard } from '@/components/layout/TablePageLayout';
import {
  contractThresholdApi,
  type ContractAmountTier,
  type ContractApproverRole,
  type OaContractAmountThreshold,
} from '@/services/api/contractRisk';
import { cn } from '@/utils/cn';

const ALL_VALUE = '__all__';
const fieldLabelClassName = 'mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-200';

const DEFAULT_FORM: OaContractAmountThreshold = {
  businessUnit: '',
  thresholdMin: 0,
  thresholdMax: undefined,
  amountTier: 'T1',
  approverRole: 'DEPT_MGR',
  status: 'ACTIVE',
  remark: '',
};

const TIER_OPTIONS: { value: ContractAmountTier; label: string }[] = [
  { value: 'T1', label: 'T1 (基础档)' },
  { value: 'T2', label: 'T2 (中等档)' },
  { value: 'T3', label: 'T3 (高额档)' },
];

const ROLE_OPTIONS: { value: ContractApproverRole; label: string }[] = [
  { value: 'DEPT_MGR', label: '部门经理' },
  { value: 'VP', label: '副总裁 / VP' },
  { value: 'CEO', label: 'CEO' },
];

const STATUS_BADGE: Record<string, string> = {
  ACTIVE:
    'border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/70 dark:bg-emerald-950/30 dark:text-emerald-200',
  INACTIVE:
    'border border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-400',
};

const TIER_BADGE: Record<string, string> = {
  T1: 'border border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900/70 dark:bg-sky-950/30 dark:text-sky-200',
  T2: 'border border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/70 dark:bg-amber-950/30 dark:text-amber-200',
  T3: 'border border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/70 dark:bg-rose-950/30 dark:text-rose-200',
};

const TableStateRow: React.FC<{ colSpan: number; title: string; description?: string; loading?: boolean }> = ({
  colSpan,
  title,
  description,
  loading = false,
}) => (
  <TableRow className="hover:bg-transparent dark:hover:bg-transparent">
    <TableCell colSpan={colSpan} className="px-4 py-16">
      <div className="flex flex-col items-center justify-center text-center">
        {loading ? <LoadingSpinner size="lg" className="mb-3" /> : null}
        <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{title}</div>
        {description ? (
          <div className="mt-2 text-xs leading-6 text-slate-500 dark:text-slate-400">{description}</div>
        ) : null}
      </div>
    </TableCell>
  </TableRow>
);

export const ContractThresholdPage: React.FC = () => {
  const [rows, setRows] = useState<OaContractAmountThreshold[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState({ pageNum: 1, pageSize: 10, keyword: '', businessUnit: '', amountTier: '', status: '' });

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editing, setEditing] = useState<OaContractAmountThreshold | null>(null);
  const [form, setForm] = useState<OaContractAmountThreshold>(DEFAULT_FORM);
  const [submitting, setSubmitting] = useState(false);

  const [confirmId, setConfirmId] = useState<number | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await contractThresholdApi.page({
        pageNum: query.pageNum,
        pageSize: query.pageSize,
        keyword: query.keyword || undefined,
        businessUnit: query.businessUnit || undefined,
        amountTier: query.amountTier || undefined,
        status: query.status || undefined,
      });
      setRows(res.records ?? []);
      setTotal(res.total ?? 0);
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const openCreate = () => {
    setEditing(null);
    setForm({ ...DEFAULT_FORM });
    setIsModalOpen(true);
  };

  const openEdit = (row: OaContractAmountThreshold) => {
    setEditing(row);
    setForm({ ...row });
    setIsModalOpen(true);
  };

  const closeModal = () => setIsModalOpen(false);

  const onSubmit = async () => {
    if (form.thresholdMin == null || Number.isNaN(Number(form.thresholdMin))) {
      toast.error('金额下限必填');
      return;
    }
    if (!form.amountTier || !form.approverRole) {
      toast.error('档位与审批角色必填');
      return;
    }
    if (form.thresholdMax != null && Number(form.thresholdMax) <= Number(form.thresholdMin)) {
      toast.error('金额上限必须大于下限');
      return;
    }
    setSubmitting(true);
    try {
      if (editing?.id) {
        await contractThresholdApi.edit({ ...form, id: editing.id });
        toast.success('更新成功');
      } else {
        await contractThresholdApi.add(form);
        toast.success('新增成功');
      }
      closeModal();
      load();
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setSubmitting(false);
    }
  };

  const onRemove = async (id: number) => {
    try {
      await contractThresholdApi.remove(id);
      toast.success('删除成功');
      load();
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setConfirmId(null);
    }
  };

  const colCount = 8;

  const tableBody = useMemo(() => {
    if (loading) {
      return <TableStateRow colSpan={colCount} title="加载中..." loading />;
    }
    if (error) {
      return <TableStateRow colSpan={colCount} title="加载失败" description={error} />;
    }
    if (rows.length === 0) {
      return <TableStateRow colSpan={colCount} title="暂无规则" description="点击右上角新建合同金额审批阈值规则" />;
    }
    return rows.map((row) => (
      <TableRow key={row.id}>
        <TableCell>{row.businessUnit || '—'}</TableCell>
        <TableCell className="font-mono text-sm">
          ¥{Number(row.thresholdMin).toLocaleString()} – {row.thresholdMax != null ? `¥${Number(row.thresholdMax).toLocaleString()}` : '∞'}
        </TableCell>
        <TableCell>
          <span className={cn('inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium', TIER_BADGE[row.amountTier])}>
            {row.amountTier}
          </span>
        </TableCell>
        <TableCell>{ROLE_OPTIONS.find((r) => r.value === row.approverRole)?.label ?? row.approverRole}</TableCell>
        <TableCell>
          <span className={cn('inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium', STATUS_BADGE[row.status || ''])}>
            {row.status === 'ACTIVE' ? '生效' : '停用'}
          </span>
        </TableCell>
        <TableCell className="max-w-[240px] truncate text-xs text-slate-500" title={row.remark}>
          {row.remark || '—'}
        </TableCell>
        <TableCell className="text-xs text-slate-500">{row.updateTime || '—'}</TableCell>
        <TableCell className="text-right">
          <TableRowActions
            actions={[
              { key: 'edit', label: '编辑', semantic: 'edit', icon: <Pencil size={15} />, onClick: () => openEdit(row) },
              { key: 'delete', label: '删除', semantic: 'delete', icon: <Trash2 size={15} />, onClick: () => row.id && setConfirmId(row.id) },
            ]}
          />
        </TableCell>
      </TableRow>
    ));
  }, [loading, error, rows]);

  return (
    <>
      <TablePageLayout
        className="gap-3"
        filters={(
          <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-slate-800 dark:bg-slate-950/88 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-1 flex-wrap items-center gap-3">
              <Input
                value={query.keyword}
                placeholder="按备注搜索"
                className="max-w-sm"
                onChange={(e) => setQuery((c) => ({ ...c, keyword: e.target.value, pageNum: 1 }))}
              />
              <div className="w-full sm:w-[160px]">
                <Input
                  value={query.businessUnit}
                  placeholder="业务单元"
                  onChange={(e) => setQuery((c) => ({ ...c, businessUnit: e.target.value, pageNum: 1 }))}
                />
              </div>
              <div className="w-full sm:w-[140px]">
                <Select
                  value={query.amountTier || ALL_VALUE}
                  onValueChange={(v) => setQuery((c) => ({ ...c, amountTier: v === ALL_VALUE ? '' : v, pageNum: 1 }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="档位" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL_VALUE}>全部</SelectItem>
                    {TIER_OPTIONS.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="w-full sm:w-[140px]">
                <Select
                  value={query.status || ALL_VALUE}
                  onValueChange={(v) => setQuery((c) => ({ ...c, status: v === ALL_VALUE ? '' : v, pageNum: 1 }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="状态" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL_VALUE}>全部</SelectItem>
                    <SelectItem value="ACTIVE">生效</SelectItem>
                    <SelectItem value="INACTIVE">停用</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => load()} disabled={loading}>
                <RefreshCw className={cn('mr-1.5 h-4 w-4', loading && 'animate-spin')} /> 刷新
              </Button>
              <Button size="sm" onClick={openCreate}>
                <Plus className="mr-1.5 h-4 w-4" /> 新建
              </Button>
            </div>
          </div>
        )}
        table={(
          <TableSurfaceCard>
            <>
              <div className="overflow-x-auto">
                <Table className="min-w-[1100px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead>业务单元</TableHead>
                      <TableHead>金额区间</TableHead>
                      <TableHead>档位</TableHead>
                      <TableHead>审批角色</TableHead>
                      <TableHead>状态</TableHead>
                      <TableHead>备注</TableHead>
                      <TableHead>更新时间</TableHead>
                      <TableActionHead className="w-32">操作</TableActionHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>{tableBody}</TableBody>
                </Table>
              </div>
              <Pagination
                page={query.pageNum}
                pageSize={query.pageSize}
                total={total}
                onPageChange={(pageNum) => setQuery((c) => ({ ...c, pageNum }))}
                onPageSizeChange={(pageSize) => setQuery((c) => ({ ...c, pageNum: 1, pageSize }))}
              />
            </>
          </TableSurfaceCard>
        )}
      />

      <BaseDialog
        open={isModalOpen}
        onClose={closeModal}
        title={editing ? '编辑合同金额阈值' : '新增合同金额阈值'}
        width="wide"
        footer={(
          <>
            <Button variant="outline" onClick={closeModal}>
              取消
            </Button>
            <Button onClick={onSubmit} disabled={submitting}>
              确定
            </Button>
          </>
        )}
      >
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className={fieldLabelClassName}>业务单元(可选,留空表示全租户通用)</label>
            <Input
              value={form.businessUnit ?? ''}
              placeholder="部门名称 / 产品线 / 留空"
              onChange={(e) => setForm({ ...form, businessUnit: e.target.value })}
            />
          </div>
          <div>
            <label className={fieldLabelClassName}>金额下限(含)*</label>
            <Input
              type="number"
              value={form.thresholdMin ?? 0}
              onChange={(e) => setForm({ ...form, thresholdMin: Number(e.target.value) })}
            />
          </div>
          <div>
            <label className={fieldLabelClassName}>金额上限(不含,留空=∞)</label>
            <Input
              type="number"
              value={form.thresholdMax ?? ''}
              onChange={(e) =>
                setForm({ ...form, thresholdMax: e.target.value === '' ? undefined : Number(e.target.value) })
              }
            />
          </div>
          <div>
            <label className={fieldLabelClassName}>档位 *</label>
            <Select
              value={form.amountTier}
              onValueChange={(v) => setForm({ ...form, amountTier: v as ContractAmountTier })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIER_OPTIONS.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className={fieldLabelClassName}>审批角色 *</label>
            <Select
              value={form.approverRole}
              onValueChange={(v) => setForm({ ...form, approverRole: v as ContractApproverRole })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLE_OPTIONS.map((r) => (
                  <SelectItem key={r.value} value={r.value}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className={fieldLabelClassName}>状态</label>
            <Select
              value={form.status ?? 'ACTIVE'}
              onValueChange={(v) => setForm({ ...form, status: v as 'ACTIVE' | 'INACTIVE' })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ACTIVE">生效</SelectItem>
                <SelectItem value="INACTIVE">停用</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2">
            <label className={fieldLabelClassName}>备注</label>
            <Textarea
              rows={3}
              value={form.remark ?? ''}
              onChange={(e) => setForm({ ...form, remark: e.target.value })}
            />
          </div>
        </div>
      </BaseDialog>

      <ConfirmDialog
        open={confirmId != null}
        title="确认删除该阈值规则?"
        description="删除后该区间将不再参与合同审批路由匹配。"
        onCancel={() => setConfirmId(null)}
        onConfirm={() => confirmId && onRemove(confirmId)}
      />
    </>
  );
};

export default ContractThresholdPage;
