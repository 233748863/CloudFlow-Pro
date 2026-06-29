import React, { useEffect, useMemo, useState } from 'react';
import { getConfigIntSync } from '../../hooks/useSystemConfig';
import { SYS_PAGE_DEFAULT_PAGE_SIZE } from '../../constants/sysConfig';
import { Edit, Plus, Power, RefreshCw, RotateCcw, Search, Trash2, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { getErrorMessage } from '@/utils/errorMessage';
import { formatDateTimeDisplay, toBackendDateString, toLocalDatetimeString } from '@/utils/dateFormat';
import {
  pageIpAcl,
  createIpAcl,
  updateIpAcl,
  deleteIpAcl,
  toggleIpAcl,
  republishIpAcl,
  type SysIpAcl,
  type IpAclRuleType,
  type IpAclMode,
  type IpAclStatus,
} from '@/services/api/acl';
import { BaseDialog, ConfirmDialog, Pagination } from '@/components/common';
import {
  Button,
  DatePicker,
  Input,
  Label,
  LoadingSpinner,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from '@/components/common';
import { cn } from '@/utils/cn';
import { InnerTableSurface, TablePageLayout } from '@/components/layout/TablePageLayout';

const ALL_VALUE = '__all__';

const DEFAULT_FORM: SysIpAcl = {
  ruleCode: '',
  ruleName: '',
  ipPattern: '',
  ruleType: 'EXACT',
  mode: 'BLACK',
  priority: 100,
  status: 'ACTIVE',
  expireAt: '',
  reason: '',
};

const RULE_TYPE_OPTIONS: { value: IpAclRuleType; label: string; tip: string }[] = [
  { value: 'EXACT', label: '精确', tip: '完全匹配单个 IP' },
  { value: 'CIDR', label: 'CIDR', tip: '形如 192.168.1.0/24' },
  { value: 'RANGE', label: '区间', tip: '形如 10.0.0.1-10.0.0.99' },
];

const MODE_OPTIONS: { value: IpAclMode; label: string; tip: string }[] = [
  { value: 'BLACK', label: '黑名单', tip: '命中即拒绝' },
  { value: 'WHITE', label: '白名单', tip: '命中即优先放行，可作为黑名单例外' },
];

const STATUS_BADGE: Record<IpAclStatus, string> = {
  ACTIVE:
    'border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/70 dark:bg-emerald-950/30 dark:text-emerald-200',
  INACTIVE:
    'border border-slate-200 bg-[var(--cf-surface-muted)] text-slate-500 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-400',
};

const MODE_BADGE: Record<IpAclMode, string> = {
  BLACK:
    'border border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/70 dark:bg-rose-950/30 dark:text-rose-200',
  WHITE:
    'border border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900/70 dark:bg-sky-950/30 dark:text-sky-200',
};

const TableStateRow: React.FC<{
  colSpan: number;
  title: string;
  description?: string;
  loading?: boolean;
}> = ({ colSpan, title, description, loading = false }) => (
  <tr className="hover:bg-transparent dark:hover:bg-transparent">
    <td colSpan={colSpan} className="px-4 py-10">
      <div className="flex flex-col items-center justify-center text-center">
        {loading ? <LoadingSpinner size="lg" className="mb-3" /> : null}
        <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{title}</div>
        {description ? (
          <div className="mt-2 text-xs leading-6 text-slate-500 dark:text-slate-400">
            {description}
          </div>
        ) : null}
      </div>
    </td>
  </tr>
);

export const IpAclPage = () => {
  const [rules, setRules] = useState<SysIpAcl[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState({ keyword: '', status: '' as '' | IpAclStatus, mode: '' as '' | IpAclMode });
  const [query, setQuery] = useState({ pageNum: 1, pageSize: getConfigIntSync(SYS_PAGE_DEFAULT_PAGE_SIZE, 10), keyword: '', status: '' as '' | IpAclStatus, mode: '' as '' | IpAclMode });

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editing, setEditing] = useState<SysIpAcl | null>(null);
  const [formData, setFormData] = useState<SysIpAcl>(DEFAULT_FORM);
  const [pendingDelete, setPendingDelete] = useState<SysIpAcl | null>(null);
  const [republishing, setRepublishing] = useState(false);

  const fetchRules = async (next = query) => {
    setLoading(true);
    setError(null);
    try {
      const response: any = await pageIpAcl({
        pageNum: next.pageNum,
        pageSize: next.pageSize,
        keyword: next.keyword || undefined,
        status: next.status || undefined,
        mode: next.mode || undefined,
      });
      const rows: SysIpAcl[] = Array.isArray(response?.records)
        ? response.records
        : Array.isArray(response?.rows)
          ? response.rows
          : [];
      setRules(rows);
      setTotal(typeof response?.total === 'number' ? response.total : rows.length);
    } catch (err) {
      console.error(err);
      const msg = '加载 IP 黑白名单失败，请稍后重试。';
      setError(msg);
      setRules([]);
      setTotal(0);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchRules();
  }, [query]);

  const hasActiveFilters = useMemo(
    () => Boolean(query.keyword || query.status || query.mode),
    [query],
  );

  const handleSearch = (event: React.FormEvent) => {
    event.preventDefault();
    setQuery((current) => ({
      ...current,
      pageNum: 1,
      keyword: filters.keyword.trim(),
      status: filters.status,
      mode: filters.mode,
    }));
  };

  const handleReset = () => {
    setFilters({ keyword: '', status: '', mode: '' });
    setQuery((current) => ({ ...current, pageNum: 1, keyword: '', status: '', mode: '' }));
  };

  const handleOpenModal = (rule?: SysIpAcl) => {
    if (rule) {
      setEditing(rule);
      setFormData({ ...rule, expireAt: rule.expireAt || '' });
    } else {
      setEditing(null);
      setFormData(DEFAULT_FORM);
    }
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditing(null);
    setFormData(DEFAULT_FORM);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!formData.ruleCode.trim() || !formData.ruleName.trim()) {
      toast.error('规则编码与名称必填');
      return;
    }
    if (!formData.ipPattern.trim()) {
      toast.error('IP 表达式必填');
      return;
    }
    try {
      const payload: SysIpAcl = {
        ...formData,
        ruleCode: formData.ruleCode.trim(),
        ruleName: formData.ruleName.trim(),
        ipPattern: formData.ipPattern.trim(),
        reason: formData.reason?.trim() || '',
        priority: Number(formData.priority || 100),
        expireAt: formData.expireAt?.trim() ? toBackendDateString(formData.expireAt) : undefined,
      };
      if (editing?.id) {
        await updateIpAcl({ ...payload, id: editing.id });
        toast.success('规则更新成功，已通知网关刷新');
      } else {
        await createIpAcl(payload);
        toast.success('规则创建成功，已通知网关刷新');
      }
      handleCloseModal();
      await fetchRules();
    } catch (err) {
      console.error(err);
      toast.error(getErrorMessage(err, editing ? '规则更新失败' : '规则创建失败'));
    }
  };

  const handleToggle = async (rule: SysIpAcl) => {
    if (!rule.id) return;
    const next: IpAclStatus = rule.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    try {
      await toggleIpAcl(rule.id, next);
      toast.success(next === 'ACTIVE' ? '规则已启用' : '规则已停用');
      await fetchRules();
    } catch (err) {
      console.error(err);
      toast.error(getErrorMessage(err, '状态切换失败'));
    }
  };

  const handleDelete = async () => {
    if (!pendingDelete?.id) return;
    try {
      await deleteIpAcl(pendingDelete.id);
      toast.success('规则已删除');
      const nextPage =
        rules.length === 1 && query.pageNum > 1 ? query.pageNum - 1 : query.pageNum;
      setPendingDelete(null);
      setQuery((current) => ({ ...current, pageNum: nextPage }));
      if (nextPage === query.pageNum) {
        await fetchRules();
      }
    } catch (err) {
      console.error(err);
      toast.error(getErrorMessage(err, '规则删除失败'));
    }
  };

  const handleRepublish = async () => {
    setRepublishing(true);
    try {
      await republishIpAcl();
      toast.success('已重发所有 ACTIVE 规则到网关');
    } catch (err) {
      console.error(err);
      toast.error(getErrorMessage(err, '重发规则失败'));
    } finally {
      setRepublishing(false);
    }
  };

  const ruleTypeTip = useMemo(() => {
    const opt = RULE_TYPE_OPTIONS.find((o) => o.value === formData.ruleType);
    return opt?.tip || '';
  }, [formData.ruleType]);
  const stats = useMemo(
    () => [
      {
        label: '规则总数',
        value: String(total),
        meta: `当前页 ${rules.length}`,
        icon: <Search size={18} />,
        tone: 'blue',
      },
      {
        label: '启用规则',
        value: String(rules.filter((rule) => rule.status === 'ACTIVE').length),
        meta: '本页统计',
        icon: <Power size={18} />,
        tone: 'green',
      },
      {
        label: '黑名单',
        value: String(rules.filter((rule) => rule.mode === 'BLACK').length),
        meta: '拒绝命中',
        icon: <Trash2 size={18} />,
        tone: 'amber',
      },
      {
        label: '网关同步',
        value: republishing ? '重发中' : '就绪',
        meta: 'ACTIVE 规则',
        icon: <Zap size={18} />,
        tone: 'violet',
      },
    ],
    [republishing, rules, total],
  );

  const pageActions = (
    <>
      <header className="admin-source-header">
        <div>
          <p className="admin-source-kicker">IP ACCESS CONTROL</p>
          <h2>IP 访问控制</h2>
          <span>管理网关黑白名单规则、优先级、有效期和启停状态</span>
        </div>
        <div className="admin-source-controls">
          <Button
            variant="outline"
            size="sm"
            onClick={handleRepublish}
            disabled={republishing}
            title="将所有启用规则重发到网关 Redis"
          >
            <Zap size={16} className={cn(republishing && 'text-cyan-600 dark:text-cyan-300')} />
            重发到网关
          </Button>
          <Button variant="outline" size="sm" onClick={() => void fetchRules()} disabled={loading}>
            <RefreshCw size={16} className={cn(loading && 'animate-spin')} />
            刷新
          </Button>
          <Button size="sm" onClick={() => handleOpenModal()}>
            <Plus size={16} />
            新增规则
          </Button>
        </div>
      </header>

      <section className="admin-source-stat-grid">
        {stats.map((stat) => (
          <article key={stat.label} className={`card admin-source-stat admin-source-tone-${stat.tone}`}>
            <div className="admin-source-stat-icon">{stat.icon}</div>
            <div>
              <p>{stat.label}</p>
              <strong>{stat.value}</strong>
              <span>{stat.meta}</span>
            </div>
          </article>
        ))}
      </section>
    </>
  );

  const pageFilters = (
    <section className="card admin-users-toolbar">
      <form onSubmit={handleSearch} className="admin-ip-acl-filter-grid">
        <label className="admin-source-search">
          <span className="input-label">规则搜索</span>
          <div className="admin-source-search-field">
            <Search size={16} />
            <Input
              value={filters.keyword}
              onChange={(e) =>
                setFilters((c) => ({ ...c, keyword: e.target.value }))
              }
              placeholder="规则编码、名称或 IP"
              type="search"
            />
          </div>
        </label>

        <label>
          <span className="input-label">模式</span>
          <Select
            value={filters.mode || ALL_VALUE}
            onValueChange={(v) =>
              setFilters((c) => ({ ...c, mode: v === ALL_VALUE ? '' : (v as IpAclMode) }))
            }
          >
            <SelectTrigger className="h-[42px]">
              <SelectValue placeholder="全部模式" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_VALUE}>全部模式</SelectItem>
              <SelectItem value="BLACK">黑名单</SelectItem>
              <SelectItem value="WHITE">白名单</SelectItem>
            </SelectContent>
          </Select>
        </label>

        <label>
          <span className="input-label">状态</span>
          <Select
            value={filters.status || ALL_VALUE}
            onValueChange={(v) =>
              setFilters((c) => ({ ...c, status: v === ALL_VALUE ? '' : (v as IpAclStatus) }))
            }
          >
            <SelectTrigger className="h-[42px]">
              <SelectValue placeholder="全部状态" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_VALUE}>全部状态</SelectItem>
              <SelectItem value="ACTIVE">启用</SelectItem>
              <SelectItem value="INACTIVE">停用</SelectItem>
            </SelectContent>
          </Select>
        </label>

        <div className="admin-users-toolbar-actions">
          <span className="admin-users-filter-count">当前 {total} 项</span>
          <Button type="submit" size="sm">
            查询
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleReset}
            disabled={!hasActiveFilters}
          >
            <RotateCcw size={14} />
            重置
          </Button>
        </div>
      </form>
    </section>
  );

  const pageTable = (
    <InnerTableSurface className="admin-ip-acl-table-panel">
      <table className="unity-data-table admin-source-table admin-ip-acl-table min-w-[1080px] table-fixed">
          <colgroup>
            <col className="w-[70px]" />
            <col className="w-[150px]" />
            <col className="w-[150px]" />
            <col className="w-[140px]" />
            <col className="w-[70px]" />
            <col className="w-[90px]" />
            <col className="w-[70px]" />
            <col className="w-[142px]" />
            <col className="w-[80px]" />
            <col className="w-[134px]" />
          </colgroup>
          <thead>
            <tr>
              <th>ID</th>
              <th>编码</th>
              <th>名称</th>
              <th>IP 表达式</th>
              <th>类型</th>
              <th>模式</th>
              <th className="text-center">优先级</th>
              <th>过期时间</th>
              <th>状态</th>
              <th className="text-right">操作</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <TableStateRow colSpan={10} title="正在加载 IP 黑白名单..." loading />
            ) : error ? (
              <TableStateRow colSpan={10} title="加载失败" description={error} />
            ) : rules.length === 0 ? (
              <TableStateRow colSpan={10} title="暂无 IP 规则" />
            ) : (
              rules.map((rule) => (
                <tr key={rule.id}>
                  <td className="text-sm text-slate-500 dark:text-slate-400">
                    {rule.id}
                  </td>
                  <td>
                    <span className="inline-block max-w-[130px] truncate font-mono text-xs text-slate-900 dark:text-slate-100">
                      {rule.ruleCode}
                    </span>
                  </td>
                  <td>
                    <span className="inline-block max-w-[130px] truncate">{rule.ruleName}</span>
                  </td>
                  <td>
                    <span className="inline-block max-w-[120px] truncate font-mono text-xs text-slate-700 dark:text-slate-200">
                      {rule.ipPattern}
                    </span>
                  </td>
                  <td>
                    <span className="text-xs text-slate-600 dark:text-slate-300">
                      {rule.ruleType}
                    </span>
                  </td>
                  <td>
                    <span
                      className={cn(
                        'inline-flex rounded-md px-2.5 py-1 text-xs font-medium',
                        MODE_BADGE[rule.mode],
                      )}
                    >
                      {rule.mode === 'BLACK' ? '黑名单' : '白名单'}
                    </span>
                  </td>
                  <td className="text-center">{rule.priority}</td>
                  <td>
                    <span className="inline-block whitespace-nowrap text-xs text-slate-500 dark:text-slate-400">
                      {formatDateTimeDisplay(rule.expireAt)}
                    </span>
                  </td>
                  <td>
                    <span
                      className={cn(
                        'inline-flex rounded-md px-2.5 py-1 text-xs font-medium',
                        STATUS_BADGE[rule.status],
                      )}
                    >
                      {rule.status === 'ACTIVE' ? '启用' : '停用'}
                    </span>
                  </td>
                  <td className="text-right">
                    <div className="admin-users-row-actions">
                      <button
                        type="button"
                        title={rule.status === 'ACTIVE' ? '停用规则' : '启用规则'}
                        onClick={() => handleToggle(rule)}
                      >
                        <Power size={15} />
                      </button>
                      <button
                        type="button"
                        title="编辑规则"
                        onClick={() => handleOpenModal(rule)}
                      >
                        <Edit size={15} />
                      </button>
                      <button
                        type="button"
                        className="danger"
                        title="删除规则"
                        onClick={() => setPendingDelete(rule)}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
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
    <>
      <section className="admin-source-page admin-ip-acl-page">
        <TablePageLayout
          actions={pageActions}
          filters={pageFilters}
          table={pageTable}
          pagination={pagePagination}
        />
      </section>

      <BaseDialog
        open={isModalOpen}
        onClose={handleCloseModal}
        title={editing ? '编辑 IP 规则' : '新增 IP 规则'}
        width="wide"
        bodyClassName="admin-dialog-stack"
        footer={(
          <>
            <Button type="button" variant="outline" onClick={handleCloseModal}>
              取消
            </Button>
            <Button type="submit" form="ip-acl-form">{editing ? '保存修改' : '新增规则'}</Button>
          </>
        )}
      >
        <form id="ip-acl-form" onSubmit={handleSubmit} className="admin-dialog-stack">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="admin-dialog-field">
              <Label>规则编码 *</Label>
              <Input
                value={formData.ruleCode}
                onChange={(e) => setFormData((c) => ({ ...c, ruleCode: e.target.value }))}
                placeholder="例如 acl.ip.office"
                disabled={Boolean(editing)}
              />
            </div>
            <div className="admin-dialog-field">
              <Label>规则名称 *</Label>
              <Input
                value={formData.ruleName}
                onChange={(e) => setFormData((c) => ({ ...c, ruleName: e.target.value }))}
                placeholder="例如 办公网络白名单"
              />
            </div>
            <div className="admin-dialog-field">
              <Label>规则类型</Label>
              <Select
                value={formData.ruleType}
                onValueChange={(v) => setFormData((c) => ({ ...c, ruleType: v as IpAclRuleType }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RULE_TYPE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label} - {opt.tip}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="admin-dialog-field">
              <Label>模式</Label>
              <Select
                value={formData.mode}
                onValueChange={(v) => setFormData((c) => ({ ...c, mode: v as IpAclMode }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MODE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label} - {opt.tip}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="admin-dialog-field sm:col-span-2">
              <Label>IP 表达式 *</Label>
              <Input
                value={formData.ipPattern}
                onChange={(e) => setFormData((c) => ({ ...c, ipPattern: e.target.value }))}
                placeholder={
                  formData.ruleType === 'CIDR'
                    ? '例如 192.168.1.0/24'
                    : formData.ruleType === 'RANGE'
                      ? '例如 10.0.0.1-10.0.0.99'
                      : '例如 203.0.113.7'
                }
              />
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{ruleTypeTip}</p>
            </div>
            <div className="admin-dialog-field">
              <Label>优先级 (数小先匹配)</Label>
              <Input
                type="number"
                value={formData.priority}
                onChange={(e) => setFormData((c) => ({ ...c, priority: Number(e.target.value) }))}
              />
            </div>
            <div className="admin-dialog-field">
              <Label>过期时间 (可选)</Label>
              <DatePicker
                type="datetime-local"
                value={formData.expireAt ? toLocalDatetimeString(formData.expireAt) : ''}
                onChange={(e) =>
                  setFormData((c) => ({
                    ...c,
                    expireAt: e.target.value ? toBackendDateString(e.target.value) : '',
                  }))
                }
              />
            </div>
            <div className="admin-dialog-field">
              <Label>状态</Label>
              <Select
                value={formData.status}
                onValueChange={(v) => setFormData((c) => ({ ...c, status: v as IpAclStatus }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ACTIVE">启用</SelectItem>
                  <SelectItem value="INACTIVE">停用</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="admin-dialog-field sm:col-span-2">
              <Label>说明</Label>
              <Textarea
                rows={2}
                value={formData.reason || ''}
                onChange={(e) => setFormData((c) => ({ ...c, reason: e.target.value }))}
                placeholder="说明这条规则的来源/目的"
              />
            </div>
          </div>
        </form>
      </BaseDialog>

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        onCancel={() => setPendingDelete(null)}
        title="删除 IP 规则"
        message={
          pendingDelete
            ? `确定删除规则「${pendingDelete.ruleName}」(${pendingDelete.ruleCode})？删除后网关将立即停止该规则。`
            : ''
        }
        confirmText="删除"
        danger
        onConfirm={handleDelete}
      />
    </>
  );
};

export default IpAclPage;
