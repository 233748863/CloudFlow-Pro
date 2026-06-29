import React, { useEffect, useMemo, useState } from 'react';
import { getConfigIntSync } from '../../hooks/useSystemConfig';
import { SYS_PAGE_DEFAULT_PAGE_SIZE } from '../../constants/sysConfig';
import { Edit, Gauge, Plus, Power, RefreshCw, RotateCcw, Search, ShieldCheck, Trash2, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { getErrorMessage } from '@/utils/errorMessage';
import {
  pageApiRatelimitRules,
  createApiRatelimitRule,
  updateApiRatelimitRule,
  deleteApiRatelimitRule,
  toggleApiRatelimitRule,
  republishApiRatelimitRules,
  type SysApiRatelimitRule,
  type RateLimitDimension,
  type RateLimitMethod,
  type RateLimitStatus,
  type RateLimitStrategy,
} from '@/services/api/apiRateLimit';
import { BaseDialog, ConfirmDialog, Pagination } from '@/components/common';
import {
  Button,
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

const DEFAULT_FORM: SysApiRatelimitRule = {
  ruleCode: '',
  ruleName: '',
  serviceName: '',
  pathPattern: '',
  httpMethod: 'ALL',
  dimension: 'IP',
  rps: 10,
  burst: 20,
  windowSeconds: 1,
  status: 'ACTIVE',
  priority: 100,
  rejectStrategy: 'REJECT',
  remark: '',
};

const DIMENSION_OPTIONS: { value: RateLimitDimension; label: string; tip: string }[] = [
  { value: 'IP', label: 'IP', tip: '按客户端 IP 限流' },
  { value: 'USER', label: '用户', tip: '按登录用户限流' },
  { value: 'TENANT', label: '租户', tip: '按租户 ID 限流' },
  { value: 'GLOBAL', label: '全局', tip: '所有请求合并计算' },
];

const METHOD_OPTIONS: RateLimitMethod[] = ['ALL', 'GET', 'POST', 'PUT', 'DELETE'];

const STRATEGY_OPTIONS: { value: RateLimitStrategy; label: string; tip: string }[] = [
  { value: 'REJECT', label: '直接拒绝', tip: '超额返回 429' },
  { value: 'LOG', label: '仅记录', tip: '超额放行但记日志' },
  { value: 'QUEUE', label: '排队', tip: '当前等价于仅记录' },
];

const STATUS_BADGE: Record<RateLimitStatus, string> = {
  ACTIVE:
    'border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/70 dark:bg-emerald-950/30 dark:text-emerald-200',
  INACTIVE:
    'border border-slate-200 bg-[var(--cf-surface-muted)] text-slate-500 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-400',
};

const STRATEGY_BADGE: Record<RateLimitStrategy, string> = {
  REJECT:
    'border border-rose-200 bg-rose-50 text-rose-600 dark:border-rose-900/70 dark:bg-rose-950/30 dark:text-rose-200',
  LOG: 'border border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/70 dark:bg-amber-950/30 dark:text-amber-200',
  QUEUE:
    'border border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900/70 dark:bg-sky-950/30 dark:text-sky-200',
};

const STRATEGY_LABEL: Record<RateLimitStrategy, string> = {
  REJECT: '直接拒绝',
  LOG: '仅记录',
  QUEUE: '排队',
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

export const ApiRateLimitPage = () => {
  const [rules, setRules] = useState<SysApiRatelimitRule[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState({ keyword: '', status: '' as '' | RateLimitStatus, dimension: '' as '' | RateLimitDimension });
  const [query, setQuery] = useState({ pageNum: 1, pageSize: getConfigIntSync(SYS_PAGE_DEFAULT_PAGE_SIZE, 10), keyword: '', status: '' as '' | RateLimitStatus, dimension: '' as '' | RateLimitDimension });

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editing, setEditing] = useState<SysApiRatelimitRule | null>(null);
  const [formData, setFormData] = useState<SysApiRatelimitRule>(DEFAULT_FORM);
  const [pendingDelete, setPendingDelete] = useState<SysApiRatelimitRule | null>(null);
  const [republishing, setRepublishing] = useState(false);

  const fetchRules = async (next = query) => {
    setLoading(true);
    setError(null);
    try {
      const response: any = await pageApiRatelimitRules({
        pageNum: next.pageNum,
        pageSize: next.pageSize,
        keyword: next.keyword || undefined,
        status: next.status || undefined,
        dimension: next.dimension || undefined,
      });
      const rows: SysApiRatelimitRule[] = Array.isArray(response?.records)
        ? response.records
        : Array.isArray(response?.rows)
          ? response.rows
          : [];
      setRules(rows);
      setTotal(typeof response?.total === 'number' ? response.total : rows.length);
    } catch (err) {
      console.error(err);
      const msg = '加载 API 限流规则失败，请稍后重试。';
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
    () => Boolean(query.keyword || query.status || query.dimension),
    [query],
  );

  const handleSearch = (event: React.FormEvent) => {
    event.preventDefault();
    setQuery((current) => ({
      ...current,
      pageNum: 1,
      keyword: filters.keyword.trim(),
      status: filters.status,
      dimension: filters.dimension,
    }));
  };

  const handleReset = () => {
    setFilters({ keyword: '', status: '', dimension: '' });
    setQuery((current) => ({ ...current, pageNum: 1, keyword: '', status: '', dimension: '' }));
  };

  const handleOpenModal = (rule?: SysApiRatelimitRule) => {
    if (rule) {
      setEditing(rule);
      setFormData({ ...rule });
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
    if (!formData.pathPattern.trim()) {
      toast.error('路径模板必填');
      return;
    }
    if (!formData.rps || formData.rps <= 0) {
      toast.error('限流次数必须大于 0');
      return;
    }
    if (!formData.windowSeconds || formData.windowSeconds <= 0) {
      toast.error('时间窗口必须大于 0 秒');
      return;
    }
    try {
      const payload: SysApiRatelimitRule = {
        ...formData,
        ruleCode: formData.ruleCode.trim(),
        ruleName: formData.ruleName.trim(),
        serviceName: formData.serviceName?.trim() || undefined,
        pathPattern: formData.pathPattern.trim(),
        remark: formData.remark?.trim() || '',
        rps: Number(formData.rps),
        burst: formData.burst ? Number(formData.burst) : undefined,
        windowSeconds: Number(formData.windowSeconds),
        priority: Number(formData.priority || 100),
      };
      if (editing?.id) {
        await updateApiRatelimitRule({ ...payload, id: editing.id });
        toast.success('规则更新成功，已通知网关刷新');
      } else {
        await createApiRatelimitRule(payload);
        toast.success('规则创建成功，已通知网关刷新');
      }
      handleCloseModal();
      await fetchRules();
    } catch (err) {
      console.error(err);
      toast.error(getErrorMessage(err, editing ? '规则更新失败' : '规则创建失败'));
    }
  };

  const handleToggle = async (rule: SysApiRatelimitRule) => {
    if (!rule.id) return;
    const next: RateLimitStatus = rule.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    try {
      await toggleApiRatelimitRule(rule.id, next);
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
      await deleteApiRatelimitRule(pendingDelete.id);
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
      await republishApiRatelimitRules();
      toast.success('已重发所有 ACTIVE 规则到网关');
    } catch (err) {
      console.error(err);
      toast.error(getErrorMessage(err, '重发规则失败'));
    } finally {
      setRepublishing(false);
    }
  };

  const stats = useMemo(
    () => [
      {
        label: '规则总数',
        value: String(total),
        meta: `当前页 ${rules.length}`,
        icon: <Gauge size={18} />,
        tone: 'blue',
      },
      {
        label: '启用规则',
        value: String(rules.filter((rule) => rule.status === 'ACTIVE').length),
        meta: '本页生效',
        icon: <ShieldCheck size={18} />,
        tone: 'green',
      },
      {
        label: '拒绝策略',
        value: String(rules.filter((rule) => rule.rejectStrategy === 'REJECT').length),
        meta: '超额返回 429',
        icon: <Power size={18} />,
        tone: 'amber',
      },
      {
        label: '维度数量',
        value: String(new Set(rules.map((rule) => rule.dimension).filter(Boolean)).size),
        meta: '本页去重',
        icon: <Zap size={18} />,
        tone: 'violet',
      },
    ],
    [rules, total],
  );

  const pageActions = (
    <>
      <header className="admin-source-header">
        <div>
          <p className="admin-source-kicker">API RATE LIMIT</p>
          <h2>接口限流</h2>
          <span>管理网关限流规则、匹配维度、窗口次数和超限策略</span>
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
      <form onSubmit={handleSearch} className="admin-api-rate-limit-filter-grid">
        <label className="admin-source-search">
          <span className="input-label">搜索规则</span>
          <div className="admin-source-search-field">
            <Search size={16} />
            <Input
              value={filters.keyword}
              onChange={(e) =>
                setFilters((c) => ({ ...c, keyword: e.target.value }))
              }
              placeholder="规则编码、名称或路径"
              type="search"
            />
          </div>
        </label>

        <label>
          <span className="input-label">状态</span>
          <Select
            value={filters.status || ALL_VALUE}
            onValueChange={(v) =>
              setFilters((c) => ({ ...c, status: v === ALL_VALUE ? '' : (v as RateLimitStatus) }))
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

        <label>
          <span className="input-label">维度</span>
          <Select
            value={filters.dimension || ALL_VALUE}
            onValueChange={(v) =>
              setFilters((c) => ({ ...c, dimension: v === ALL_VALUE ? '' : (v as RateLimitDimension) }))
            }
          >
            <SelectTrigger className="h-[42px]">
              <SelectValue placeholder="全部维度" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_VALUE}>全部维度</SelectItem>
              {DIMENSION_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
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
    <InnerTableSurface className="admin-api-rate-limit-table-panel">
      <table className="unity-data-table admin-source-table admin-api-rate-limit-table min-w-[1100px] table-fixed">
          <colgroup>
            <col className="w-[76px]" />
            <col className="w-[148px]" />
            <col className="w-[138px]" />
            <col className="w-[176px]" />
            <col className="w-[78px]" />
            <col className="w-[120px]" />
            <col className="w-[70px]" />
            <col className="w-[92px]" />
            <col className="w-[76px]" />
            <col className="w-[126px]" />
          </colgroup>
          <thead>
            <tr>
              <th>ID</th>
              <th>编码</th>
              <th>名称</th>
              <th>路径 / 方法</th>
              <th>维度</th>
              <th className="text-center">
                <span className="inline-flex flex-col items-center leading-4">
                  <span>次数 / 突发</span>
                  <span>窗口</span>
                </span>
              </th>
              <th className="text-center">优先级</th>
              <th>策略</th>
              <th>状态</th>
              <th className="text-right">操作</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <TableStateRow colSpan={10} title="正在加载限流规则..." loading />
            ) : error ? (
              <TableStateRow colSpan={10} title="加载失败" description={error} />
            ) : rules.length === 0 ? (
              <TableStateRow colSpan={10} title="暂无限流规则" />
            ) : (
              rules.map((rule) => (
                <tr key={rule.id}>
                  <td className="text-sm text-slate-500 dark:text-slate-400">{rule.id}</td>
                  <td>
                    <span className="inline-block max-w-[128px] truncate font-mono text-xs text-slate-900 dark:text-slate-100">
                      {rule.ruleCode}
                    </span>
                  </td>
                  <td>
                    <span className="inline-block max-w-[118px] truncate">{rule.ruleName}</span>
                  </td>
                  <td>
                    <div className="flex min-w-0 flex-col gap-1">
                      <span className="truncate font-mono text-xs text-slate-700 dark:text-slate-200">
                        {rule.pathPattern}
                      </span>
                      <span className="truncate text-[11px] text-slate-500 dark:text-slate-400">
                        {rule.httpMethod}
                        {rule.serviceName ? ` · ${rule.serviceName}` : ''}
                      </span>
                    </div>
                  </td>
                  <td>
                    <span className="inline-flex rounded-md border border-sky-200 bg-sky-50 px-2.5 py-1 text-xs font-medium text-sky-700 dark:border-sky-900/70 dark:bg-sky-950/30 dark:text-sky-200">
                      {rule.dimension}
                    </span>
                  </td>
                  <td className="text-center">
                    <span className="whitespace-nowrap font-mono text-sm">
                      {rule.rps}
                      <span className="mx-1 text-slate-400">/</span>
                      {rule.burst ?? rule.rps}
                      <span className="mx-1 text-slate-400">@</span>
                      {rule.windowSeconds ?? 1}s
                    </span>
                  </td>
                  <td className="text-center">{rule.priority}</td>
                  <td>
                    <span
                      className={cn(
                        'inline-flex rounded-md px-2.5 py-1 text-xs font-medium',
                        STRATEGY_BADGE[rule.rejectStrategy],
                      )}
                    >
                      {STRATEGY_LABEL[rule.rejectStrategy] || rule.rejectStrategy}
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
                      <button type="button" title="编辑规则" onClick={() => handleOpenModal(rule)}>
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
      <section className="admin-source-page admin-api-rate-limit-page">
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
        title={editing ? '编辑限流规则' : '新增限流规则'}
        width="wide"
        bodyClassName="admin-dialog-stack"
        footer={(
          <>
            <Button type="button" variant="outline" onClick={handleCloseModal}>
              取消
            </Button>
            <Button type="submit" form="api-rate-limit-form">{editing ? '保存修改' : '新增规则'}</Button>
          </>
        )}
      >
        <form id="api-rate-limit-form" onSubmit={handleSubmit} className="admin-dialog-stack">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="admin-dialog-field">
              <Label>规则编码 *</Label>
              <Input
                value={formData.ruleCode}
                onChange={(e) => setFormData((c) => ({ ...c, ruleCode: e.target.value }))}
                placeholder="例如 auth.login.guard"
                disabled={Boolean(editing)}
              />
            </div>
            <div className="admin-dialog-field">
              <Label>规则名称 *</Label>
              <Input
                value={formData.ruleName}
                onChange={(e) => setFormData((c) => ({ ...c, ruleName: e.target.value }))}
                placeholder="例如 登录接口限流"
              />
            </div>
            <div className="admin-dialog-field sm:col-span-2">
              <Label>路径模板 (Ant 风格) *</Label>
              <Input
                value={formData.pathPattern}
                onChange={(e) => setFormData((c) => ({ ...c, pathPattern: e.target.value }))}
                placeholder="/auth/login 或 /oa/**"
              />
            </div>
            <div className="admin-dialog-field">
              <Label>目标服务 (可选)</Label>
              <Input
                value={formData.serviceName || ''}
                onChange={(e) => setFormData((c) => ({ ...c, serviceName: e.target.value }))}
                placeholder="为空匹配全部服务"
              />
            </div>
            <div className="admin-dialog-field">
              <Label>HTTP 方法</Label>
              <Select
                value={formData.httpMethod}
                onValueChange={(v) => setFormData((c) => ({ ...c, httpMethod: v as RateLimitMethod }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {METHOD_OPTIONS.map((m) => (
                    <SelectItem key={m} value={m}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="admin-dialog-field">
              <Label>限流维度</Label>
              <Select
                value={formData.dimension}
                onValueChange={(v) => setFormData((c) => ({ ...c, dimension: v as RateLimitDimension }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DIMENSION_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label} - {opt.tip}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="admin-dialog-field">
              <Label>次数上限 *</Label>
              <Input
                type="number"
                min={1}
                value={formData.rps}
                onChange={(e) => setFormData((c) => ({ ...c, rps: Number(e.target.value) }))}
              />
            </div>
            <div className="admin-dialog-field">
              <Label>突发上限</Label>
              <Input
                type="number"
                min={1}
                value={formData.burst ?? ''}
                onChange={(e) =>
                  setFormData((c) => ({ ...c, burst: e.target.value === '' ? undefined : Number(e.target.value) }))
                }
                placeholder="默认 = 次数上限"
              />
            </div>
            <div className="admin-dialog-field">
              <Label>时间窗口(秒) *</Label>
              <Input
                type="number"
                min={1}
                value={formData.windowSeconds ?? 1}
                onChange={(e) => setFormData((c) => ({ ...c, windowSeconds: Number(e.target.value) }))}
              />
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
              <Label>超限策略</Label>
              <Select
                value={formData.rejectStrategy}
                onValueChange={(v) =>
                  setFormData((c) => ({ ...c, rejectStrategy: v as RateLimitStrategy }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STRATEGY_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label} - {opt.tip}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="admin-dialog-field">
              <Label>状态</Label>
              <Select
                value={formData.status}
                onValueChange={(v) => setFormData((c) => ({ ...c, status: v as RateLimitStatus }))}
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
              <Label>备注</Label>
              <Textarea
                rows={2}
                value={formData.remark || ''}
                onChange={(e) => setFormData((c) => ({ ...c, remark: e.target.value }))}
                placeholder="说明这条规则的来源/目的"
              />
            </div>
          </div>
        </form>
      </BaseDialog>

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        onCancel={() => setPendingDelete(null)}
        title="删除限流规则"
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

export default ApiRateLimitPage;
