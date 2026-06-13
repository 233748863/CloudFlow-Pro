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
import { TablePageLayout, TableSurfaceCard } from '@/components/layout/TablePageLayout';
import {
  Button,
  DatePicker,
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
    'border border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-400',
};

const MODE_BADGE: Record<IpAclMode, string> = {
  BLACK:
    'border border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/70 dark:bg-rose-950/30 dark:text-rose-200',
  WHITE:
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
                  placeholder="搜索规则编码/名称/IP"
                  className="h-10 pl-10"
                />
              </div>

              <div className="w-full sm:w-36">
                <Select
                  value={filters.mode || ALL_VALUE}
                  onValueChange={(v) =>
                    setFilters((c) => ({ ...c, mode: v === ALL_VALUE ? '' : (v as IpAclMode) }))
                  }
                >
                  <SelectTrigger className="h-10">
                    <SelectValue placeholder="全部模式" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL_VALUE}>全部模式</SelectItem>
                    <SelectItem value="BLACK">黑名单</SelectItem>
                    <SelectItem value="WHITE">白名单</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="w-full sm:w-36">
                <Select
                  value={filters.status || ALL_VALUE}
                  onValueChange={(v) =>
                    setFilters((c) => ({ ...c, status: v === ALL_VALUE ? '' : (v as IpAclStatus) }))
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
          <TableSurfaceCard fill>
            <>
              <div className="overflow-x-auto">
                <Table className="min-w-[1280px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead>ID</TableHead>
                      <TableHead>编码</TableHead>
                      <TableHead>名称</TableHead>
                      <TableHead>IP 表达式</TableHead>
                      <TableHead>类型</TableHead>
                      <TableHead>模式</TableHead>
                      <TableHead className="text-center">优先级</TableHead>
                      <TableHead>过期时间</TableHead>
                      <TableHead>状态</TableHead>
                      <TableActionHead className="w-40">操作</TableActionHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      <TableStateRow colSpan={10} title="正在加载 IP 黑白名单..." loading />
                    ) : error ? (
                      <TableStateRow colSpan={10} title="加载失败" description={error} />
                    ) : rules.length === 0 ? (
                      <TableStateRow colSpan={10} title="暂无 IP 规则" />
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
                            <span className="font-mono text-xs text-slate-700 dark:text-slate-200">
                              {rule.ipPattern}
                            </span>
                          </TableCell>
                          <TableCell>
                            <span className="text-xs text-slate-600 dark:text-slate-300">
                              {rule.ruleType}
                            </span>
                          </TableCell>
                          <TableCell>
                            <span
                              className={cn(
                                'inline-flex rounded-full px-2.5 py-1 text-xs font-medium',
                                MODE_BADGE[rule.mode],
                              )}
                            >
                              {rule.mode === 'BLACK' ? '黑名单' : '白名单'}
                            </span>
                          </TableCell>
                          <TableCell className="text-center">{rule.priority}</TableCell>
                          <TableCell>
                            <span className="text-xs text-slate-500 dark:text-slate-400">
                              {formatDateTimeDisplay(rule.expireAt)}
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
                              align="end"
                              actions={[
                                {
                                  label: rule.status === 'ACTIVE' ? '停用规则' : '启用规则',
                                  icon: <Power size={15} />,
                                  onClick: () => handleToggle(rule),
                                  tone: rule.status === 'ACTIVE' ? 'warning' : 'success',
                                },
                                {
                                  label: '编辑规则',
                                  icon: <Edit size={15} />,
                                  onClick: () => handleOpenModal(rule),
                                  tone: 'neutral',
                                },
                                {
                                  label: '删除规则',
                                  icon: <Trash2 size={15} />,
                                  onClick: () => setPendingDelete(rule),
                                  tone: 'danger',
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
        title={editing ? '编辑 IP 规则' : '新增 IP 规则'}
        width="wide"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={fieldLabelClassName}>规则编码 *</label>
              <Input
                value={formData.ruleCode}
                onChange={(e) => setFormData((c) => ({ ...c, ruleCode: e.target.value }))}
                placeholder="例如 acl.ip.office"
                disabled={Boolean(editing)}
              />
            </div>
            <div>
              <label className={fieldLabelClassName}>规则名称 *</label>
              <Input
                value={formData.ruleName}
                onChange={(e) => setFormData((c) => ({ ...c, ruleName: e.target.value }))}
                placeholder="例如 办公网络白名单"
              />
            </div>
            <div>
              <label className={fieldLabelClassName}>规则类型</label>
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
            <div>
              <label className={fieldLabelClassName}>模式</label>
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
            <div className="sm:col-span-2">
              <label className={fieldLabelClassName}>IP 表达式 *</label>
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
            <div>
              <label className={fieldLabelClassName}>优先级 (数小先匹配)</label>
              <Input
                type="number"
                value={formData.priority}
                onChange={(e) => setFormData((c) => ({ ...c, priority: Number(e.target.value) }))}
              />
            </div>
            <div>
              <label className={fieldLabelClassName}>过期时间 (可选)</label>
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
            <div>
              <label className={fieldLabelClassName}>状态</label>
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
            <div className="sm:col-span-2">
              <label className={fieldLabelClassName}>说明</label>
              <Textarea
                rows={2}
                value={formData.reason || ''}
                onChange={(e) => setFormData((c) => ({ ...c, reason: e.target.value }))}
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
