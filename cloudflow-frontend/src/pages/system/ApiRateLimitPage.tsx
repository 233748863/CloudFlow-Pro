import React, { useEffect, useMemo, useState } from 'react';
import { Plus, RefreshCw, RotateCcw, Search, Zap } from 'lucide-react';
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
import { TablePageLayout, TableSurfaceCard } from '@/components/layout/TablePageLayout';
import {
  Button,
  Input,
  LoadingSpinner,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Table,
  TableActionHead,
  TableRowActions,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Textarea,
} from '@/components/common';
import { cn } from '@/utils/cn';

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
    'border border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-400',
};

const STRATEGY_BADGE: Record<RateLimitStrategy, string> = {
  REJECT:
    'border border-rose-200 bg-rose-50 text-rose-600 dark:border-rose-900/70 dark:bg-rose-950/30 dark:text-rose-200',
  LOG: 'border border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/70 dark:bg-amber-950/30 dark:text-amber-200',
  QUEUE:
    'border border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900/70 dark:bg-sky-950/30 dark:text-sky-200',
};

const fieldLabelClassName = 'mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-200';

const TableStateRow: React.FC<{
  colSpan: number;
  title: string;
  description?: string;
  loading?: boolean;
}> = ({ colSpan, title, description, loading = false }) => (
  <TableRow className="hover:bg-transparent dark:hover:bg-transparent">
    <TableCell colSpan={colSpan} className="px-4 py-16">
      <div className="flex flex-col items-center justify-center text-center">
        {loading ? <LoadingSpinner size="lg" className="mb-3" /> : null}
        <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{title}</div>
        {description ? (
          <div className="mt-2 text-xs leading-6 text-slate-500 dark:text-slate-400">
            {description}
          </div>
        ) : null}
      </div>
    </TableCell>
  </TableRow>
);

export const ApiRateLimitPage = () => {
  const [rules, setRules] = useState<SysApiRatelimitRule[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState({ keyword: '', status: '' as '' | RateLimitStatus, dimension: '' as '' | RateLimitDimension });
  const [query, setQuery] = useState({ pageNum: 1, pageSize: 10, keyword: '', status: '' as '' | RateLimitStatus, dimension: '' as '' | RateLimitDimension });

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
      toast.error('RPS 必须大于 0');
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

  return (
    <>
      <TablePageLayout
        className="gap-3"
        filters={(
          <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-950/88">
            <form onSubmit={handleSearch} className="flex flex-1 flex-wrap items-center gap-3">
              <div className="relative w-full sm:w-64">
                <Search
                  size={16}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500"
                />
                <Input
                  value={filters.keyword}
                  onChange={(e) =>
                    setFilters((c) => ({ ...c, keyword: e.target.value }))
                  }
                  placeholder="搜索规则编码/名称/路径"
                  className="h-10 pl-10"
                />
              </div>

              <div className="w-full sm:w-36">
                <Select
                  value={filters.status || ALL_VALUE}
                  onValueChange={(v) =>
                    setFilters((c) => ({ ...c, status: v === ALL_VALUE ? '' : (v as RateLimitStatus) }))
                  }
                >
                  <SelectTrigger className="h-10">
                    <SelectValue placeholder="全部状态" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL_VALUE}>全部状态</SelectItem>
                    <SelectItem value="ACTIVE">启用</SelectItem>
                    <SelectItem value="INACTIVE">停用</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="w-full sm:w-36">
                <Select
                  value={filters.dimension || ALL_VALUE}
                  onValueChange={(v) =>
                    setFilters((c) => ({ ...c, dimension: v === ALL_VALUE ? '' : (v as RateLimitDimension) }))
                  }
                >
                  <SelectTrigger className="h-10">
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
              </div>

              <Button type="submit" size="sm">
                查询
              </Button>

              {hasActiveFilters ? (
                <Button type="button" variant="outline" size="sm" onClick={handleReset}>
                  <RotateCcw size={14} />
                  重置
                </Button>
              ) : null}
            </form>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleRepublish}
                disabled={republishing}
                title="将所有启用规则重发到网关 Redis"
              >
                <Zap size={15} className={cn(republishing && 'animate-pulse')} />
                重发到网关
              </Button>
              <Button variant="outline" size="sm" onClick={() => void fetchRules()} disabled={loading}>
                <RefreshCw size={15} className={cn(loading && 'animate-spin')} />
                刷新
              </Button>
              <Button size="sm" onClick={() => handleOpenModal()}>
                <Plus size={15} />
                新增规则
              </Button>
            </div>
          </div>
        )}
        table={(
          <TableSurfaceCard>
            <>
              <div className="overflow-x-auto">
                <Table className="min-w-[1280px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead>ID</TableHead>
                      <TableHead>编码</TableHead>
                      <TableHead>名称</TableHead>
                      <TableHead>路径 / 方法</TableHead>
                      <TableHead>维度</TableHead>
                      <TableHead className="text-center">RPS / Burst</TableHead>
                      <TableHead className="text-center">优先级</TableHead>
                      <TableHead>策略</TableHead>
                      <TableHead>状态</TableHead>
                      <TableActionHead className="w-40">操作</TableActionHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      <TableStateRow colSpan={10} title="正在加载限流规则..." loading />
                    ) : error ? (
                      <TableStateRow colSpan={10} title="加载失败" description={error} />
                    ) : rules.length === 0 ? (
                      <TableStateRow colSpan={10} title="暂无限流规则" />
                    ) : (
                      rules.map((rule) => (
                        <TableRow key={rule.id}>
                          <TableCell className="text-sm text-slate-500 dark:text-slate-400">
                            {rule.id}
                          </TableCell>
                          <TableCell>
                            <span className="font-mono text-xs text-slate-900 dark:text-slate-100">
                              {rule.ruleCode}
                            </span>
                          </TableCell>
                          <TableCell>{rule.ruleName}</TableCell>
                          <TableCell>
                            <div className="flex flex-col gap-1">
                              <span className="font-mono text-xs text-slate-700 dark:text-slate-200">
                                {rule.pathPattern}
                              </span>
                              <span className="text-[11px] text-slate-500 dark:text-slate-400">
                                {rule.httpMethod}
                                {rule.serviceName ? ` · ${rule.serviceName}` : ''}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <span className="inline-flex rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-xs font-medium text-sky-700 dark:border-sky-900/70 dark:bg-sky-950/30 dark:text-sky-200">
                              {rule.dimension}
                            </span>
                          </TableCell>
                          <TableCell className="text-center">
                            <span className="font-mono text-sm">
                              {rule.rps}
                              <span className="mx-1 text-slate-400">/</span>
                              {rule.burst ?? rule.rps}
                            </span>
                          </TableCell>
                          <TableCell className="text-center">{rule.priority}</TableCell>
                          <TableCell>
                            <span
                              className={cn(
                                'inline-flex rounded-full px-2.5 py-1 text-xs font-medium',
                                STRATEGY_BADGE[rule.rejectStrategy],
                              )}
                            >
                              {rule.rejectStrategy}
                            </span>
                          </TableCell>
                          <TableCell>
                            <span
                              className={cn(
                                'inline-flex rounded-full px-2.5 py-1 text-xs font-medium',
                                STATUS_BADGE[rule.status],
                              )}
                            >
                              {rule.status === 'ACTIVE' ? '启用' : '停用'}
                            </span>
                          </TableCell>
                          <TableCell>
                            <TableRowActions
                              actions={[
                                {
                                  key: 'toggle',
                                  label: rule.status === 'ACTIVE' ? '停用' : '启用',
                                  semantic: rule.status === 'ACTIVE' ? 'disable' : 'enable',
                                  onClick: () => handleToggle(rule),
                                },
                                {
                                  key: 'edit',
                                  label: '编辑',
                                  semantic: 'edit',
                                  onClick: () => handleOpenModal(rule),
                                },
                                {
                                  key: 'delete',
                                  label: '删除',
                                  semantic: 'delete',
                                  onClick: () => setPendingDelete(rule),
                                },
                              ]}
                            />
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
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
        onClose={handleCloseModal}
        title={editing ? '编辑限流规则' : '新增限流规则'}
        width="wide"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={fieldLabelClassName}>规则编码 *</label>
              <Input
                value={formData.ruleCode}
                onChange={(e) => setFormData((c) => ({ ...c, ruleCode: e.target.value }))}
                placeholder="例如 auth.login.guard"
                disabled={Boolean(editing)}
              />
            </div>
            <div>
              <label className={fieldLabelClassName}>规则名称 *</label>
              <Input
                value={formData.ruleName}
                onChange={(e) => setFormData((c) => ({ ...c, ruleName: e.target.value }))}
                placeholder="例如 登录接口限流"
              />
            </div>
            <div className="sm:col-span-2">
              <label className={fieldLabelClassName}>路径模板 (Ant 风格) *</label>
              <Input
                value={formData.pathPattern}
                onChange={(e) => setFormData((c) => ({ ...c, pathPattern: e.target.value }))}
                placeholder="/auth/login 或 /oa/**"
              />
            </div>
            <div>
              <label className={fieldLabelClassName}>目标服务 (可选)</label>
              <Input
                value={formData.serviceName || ''}
                onChange={(e) => setFormData((c) => ({ ...c, serviceName: e.target.value }))}
                placeholder="为空匹配全部服务"
              />
            </div>
            <div>
              <label className={fieldLabelClassName}>HTTP 方法</label>
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
            <div>
              <label className={fieldLabelClassName}>限流维度</label>
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
            <div>
              <label className={fieldLabelClassName}>RPS (每秒上限) *</label>
              <Input
                type="number"
                min={1}
                value={formData.rps}
                onChange={(e) => setFormData((c) => ({ ...c, rps: Number(e.target.value) }))}
              />
            </div>
            <div>
              <label className={fieldLabelClassName}>Burst (令牌桶容量)</label>
              <Input
                type="number"
                min={1}
                value={formData.burst ?? ''}
                onChange={(e) =>
                  setFormData((c) => ({ ...c, burst: e.target.value === '' ? undefined : Number(e.target.value) }))
                }
                placeholder="默认 = RPS"
              />
            </div>
            <div>
              <label className={fieldLabelClassName}>优先级 (数小先匹配)</label>
              <Input
                type="number"
                value={formData.priority}
                onChange={(e) => setFormData((c) => ({ ...c, priority: Number(e.target.value) }))}
              />
            </div>
            <div>
              <label className={fieldLabelClassName}>超限策略</label>
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
            <div>
              <label className={fieldLabelClassName}>状态</label>
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
            <div className="sm:col-span-2">
              <label className={fieldLabelClassName}>备注</label>
              <Textarea
                rows={2}
                value={formData.remark || ''}
                onChange={(e) => setFormData((c) => ({ ...c, remark: e.target.value }))}
                placeholder="说明这条规则的来源/目的"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={handleCloseModal}>
              取消
            </Button>
            <Button type="submit">{editing ? '保存修改' : '新增规则'}</Button>
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
