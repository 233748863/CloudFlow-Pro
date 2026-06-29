import React, { useEffect, useMemo, useState } from 'react';
import { getConfigIntSync } from '../../hooks/useSystemConfig';
import { SYS_PAGE_DEFAULT_PAGE_SIZE } from '../../constants/sysConfig';
import { FileSpreadsheet, Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react';
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
  Textarea,
} from '@/components/common';
import { InnerTableSurface, TablePageLayout } from '@/components/layout/TablePageLayout';
import {
  contractThresholdApi,
  type ContractAmountTier,
  type ContractApproverRole,
  type OaContractAmountThreshold,
} from '@/services/api/contractRisk';
import { cn } from '@/utils/cn';
import { useDict } from '@/hooks/useDict';
import { DictBadge } from '@/components/common/DictBadge';

const ALL_VALUE = '__all__';
const fieldLabelClassName = 'input-label';

const DEFAULT_FORM: OaContractAmountThreshold = {
  businessUnit: '',
  thresholdMin: 0,
  thresholdMax: undefined,
  amountTier: 'T1',
  approverRole: 'DEPT_MGR',
  status: 'ACTIVE',
  remark: '',
};

const TIER_VALUES: ContractAmountTier[] = ['T1', 'T2', 'T3'];
const ROLE_VALUES: ContractApproverRole[] = ['DEPT_MGR', 'VP', 'CEO'];
const STATUS_VALUES: ('ACTIVE' | 'INACTIVE')[] = ['ACTIVE', 'INACTIVE'];

const TableStateRow: React.FC<{ colSpan: number; title: string; description?: string; loading?: boolean }> = ({
  colSpan,
  title,
  description,
  loading = false,
}) => (
  <tr>
    <td colSpan={colSpan} className="px-4 py-10">
      <div className="flex flex-col items-center justify-center text-center">
        {loading ? <LoadingSpinner size="lg" className="mb-3" /> : null}
        <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{title}</div>
        {description ? (
          <div className="mt-2 text-xs leading-6 text-slate-500 dark:text-slate-400">{description}</div>
        ) : null}
      </div>
    </td>
  </tr>
);

export const ContractThresholdPage: React.FC = () => {
  const tierDict = useDict('oa_contract_amount_tier');
  const roleDict = useDict('oa_contract_approver_role');
  const statusDict = useDict('oa_contract_threshold_status');
  const [rows, setRows] = useState<OaContractAmountThreshold[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState({ pageNum: 1, pageSize: getConfigIntSync(SYS_PAGE_DEFAULT_PAGE_SIZE, 10), keyword: '', businessUnit: '', amountTier: '', status: '' });

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
      <tr key={row.id}>
        <td>{row.businessUnit || '—'}</td>
        <td className="font-mono text-sm">
          ¥{Number(row.thresholdMin).toLocaleString()} – {row.thresholdMax != null ? `¥${Number(row.thresholdMax).toLocaleString()}` : '∞'}
        </td>
        <td>
          <DictBadge dictType="oa_contract_amount_tier" value={String(row.amountTier || '')} />
        </td>
        <td>{roleDict.getLabel(row.approverRole)}</td>
        <td>
          <DictBadge dictType="oa_contract_threshold_status" value={String(row.status || '')} />
        </td>
        <td className="max-w-[240px] truncate text-xs text-slate-500" title={row.remark}>
          {row.remark || '—'}
        </td>
        <td className="text-xs text-slate-500">{row.updateTime || '—'}</td>
        <td>
          <div className="admin-users-row-actions">
            <button type="button" title="编辑" aria-label="编辑" onClick={() => openEdit(row)}><Pencil size={15} /></button>
            <button type="button" className="danger" title="删除" aria-label="删除" onClick={() => row.id && setConfirmId(row.id)}><Trash2 size={15} /></button>
          </div>
        </td>
      </tr>
    ));
  }, [loading, error, rows]);

  const activeCount = rows.filter((row) => row.status === 'ACTIVE').length;
  const inactiveCount = rows.filter((row) => row.status === 'INACTIVE').length;
  const currentTierLabel = query.amountTier ? tierDict.getLabel(query.amountTier) || query.amountTier : '全部档位';
  const currentStatusLabel = query.status ? statusDict.getLabel(query.status) || query.status : '全部状态';
  const hasActiveFilters = Boolean(query.keyword || query.businessUnit || query.amountTier || query.status);
  const statCards = [
    { label: '阈值规则', value: String(total), detail: '审批路由', icon: FileSpreadsheet, tone: 'blue' },
    { label: '启用中', value: String(activeCount), detail: '当前页', icon: RefreshCw, tone: 'green' },
    { label: '停用', value: String(inactiveCount), detail: '当前页', icon: RefreshCw, tone: 'amber' },
    { label: '档位', value: String(TIER_VALUES.length), detail: currentTierLabel, icon: Pencil, tone: 'violet' },
  ];

  const pageActions = (
    <>
      <header className="admin-source-header">
        <div>
          <p className="admin-source-kicker">CONTRACT THRESHOLD</p>
          <h2>合同金额阈值</h2>
          <span>配置合同金额区间、审批档位和审批角色路由</span>
        </div>
        <div className="admin-source-controls">
          <Button variant="outline" size="sm" onClick={() => load()} disabled={loading}>
            <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
            刷新
          </Button>
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-4 w-4" />
            新建
          </Button>
        </div>
      </header>

      <section className="admin-source-stat-grid">
        {statCards.map((stat) => {
          const Icon = stat.icon;
          return (
            <article key={stat.label} className={`card admin-source-stat admin-source-tone-${stat.tone}`}>
              <div className="admin-source-stat-icon"><Icon size={18} /></div>
              <div>
                <p>{stat.label}</p>
                <strong>{stat.value}</strong>
                <span>{stat.detail}</span>
              </div>
            </article>
          );
        })}
      </section>
    </>
  );

  const pageFilters = (
      <section className="card admin-users-toolbar">
        <div className="admin-oa-filter-grid">
          <label>
            <span className="input-label">备注</span>
              <Input
                value={query.keyword}
                placeholder="按备注搜索"
                className="h-[42px]"
                onChange={(e) => setQuery((c) => ({ ...c, keyword: e.target.value, pageNum: 1 }))}
              />
          </label>
          <label>
            <span className="input-label">业务单元</span>
            <Input
              value={query.businessUnit}
              placeholder="业务单元"
              className="h-[42px]"
              onChange={(e) => setQuery((c) => ({ ...c, businessUnit: e.target.value, pageNum: 1 }))}
            />
          </label>
          <label>
            <span className="input-label">档位</span>
            <Select
              value={query.amountTier || ALL_VALUE}
              onValueChange={(v) => setQuery((c) => ({ ...c, amountTier: v === ALL_VALUE ? '' : v, pageNum: 1 }))}
            >
              <SelectTrigger className="h-[42px]">
                <SelectValue placeholder="档位" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_VALUE}>全部</SelectItem>
                {TIER_VALUES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {tierDict.getLabel(t)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <label>
            <span className="input-label">状态</span>
            <Select
              value={query.status || ALL_VALUE}
              onValueChange={(v) => setQuery((c) => ({ ...c, status: v === ALL_VALUE ? '' : v, pageNum: 1 }))}
            >
              <SelectTrigger className="h-[42px]">
                <SelectValue placeholder="状态" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_VALUE}>全部</SelectItem>
                {STATUS_VALUES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {statusDict.getLabel(s)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <div className="admin-users-toolbar-actions">
            <span className="admin-users-filter-count">{hasActiveFilters ? `${currentTierLabel} / ${currentStatusLabel}` : `共 ${total} 条`}</span>
          </div>
        </div>
      </section>
  );

  const pageTable = (
      <InnerTableSurface>
          <table className="unity-data-table admin-source-table min-w-[1100px]">
            <thead>
              <tr>
                <th>业务单元</th>
                <th>金额区间</th>
                <th>档位</th>
                <th>审批角色</th>
                <th>状态</th>
                <th>备注</th>
                <th>更新时间</th>
                <th className="text-right">操作</th>
              </tr>
            </thead>
            <tbody>{tableBody}</tbody>
          </table>
      </InnerTableSurface>
  );

  const pagePagination = total > 0 ? (
    <Pagination
      page={query.pageNum}
      pageSize={query.pageSize}
      total={total}
      onPageChange={(pageNum) => setQuery((c) => ({ ...c, pageNum }))}
      onPageSizeChange={(pageSize) => setQuery((c) => ({ ...c, pageNum: 1, pageSize }))}
    />
  ) : null;

  return (
    <section className="admin-source-page">
      <TablePageLayout
        actions={pageActions}
        filters={pageFilters}
        table={pageTable}
        pagination={pagePagination}
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
                {TIER_VALUES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {tierDict.getLabel(t)}
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
                {ROLE_VALUES.map((r) => (
                  <SelectItem key={r} value={r}>
                    {roleDict.getLabel(r)}
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
                {STATUS_VALUES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {statusDict.getLabel(s)}
                  </SelectItem>
                ))}
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
    </section>
  );
};

export default ContractThresholdPage;
