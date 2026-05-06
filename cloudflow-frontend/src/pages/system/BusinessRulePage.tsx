import React, { useEffect, useState } from 'react';
import { Edit, ListChecks, RefreshCw, RotateCcw, Search } from 'lucide-react';
import { toast } from 'sonner';
import {
  BaseDialog,
  Button,
  Input,
  LoadingSpinner,
  Pagination,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  Table,
  TableActionHead,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Textarea,
} from '@/components/common';
import { TablePageLayout } from '@/components/layout/TablePageLayout';
import { TableRowActions } from '@/components/common/table-row-actions';
import {
  BusinessRule,
  listBusinessRules,
  setBusinessRuleEnabled,
  updateBusinessRule,
} from '@/services/api/businessRule';
import { cn } from '@/utils/cn';
import { getErrorMessage } from '@/utils/errorMessage';

const ALL_VALUE = '__all__';
const fieldLabelClassName = 'mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-200';

const effectClassName: Record<string, string> = {
  BLOCK: 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200',
  WARN: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200',
  PASS: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200',
};

const normalizeListResponse = (response: any) => {
  const rows = Array.isArray(response?.records)
    ? response.records
    : Array.isArray(response?.rows)
      ? response.rows
      : Array.isArray(response)
        ? response
        : [];
  return {
    rows: rows as BusinessRule[],
    total: typeof response?.total === 'number' ? response.total : rows.length,
  };
};

const TableStateRow: React.FC<{ colSpan: number; title: string; loading?: boolean }> = ({ colSpan, title, loading }) => (
  <TableRow className="hover:bg-transparent dark:hover:bg-transparent">
    <TableCell colSpan={colSpan} className="px-4 py-14 text-center">
      {loading ? <LoadingSpinner size="lg" className="mx-auto mb-3" /> : null}
      <div className="text-sm text-slate-500 dark:text-slate-400">{title}</div>
    </TableCell>
  </TableRow>
);

export const BusinessRulePage = () => {
  const [rows, setRows] = useState<BusinessRule[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState({ pageNum: 1, pageSize: 10, module: '', ruleCode: '', enabled: '' });
  const [filters, setFilters] = useState({ module: '', ruleCode: '', enabled: '' });
  const [editingRule, setEditingRule] = useState<BusinessRule | null>(null);
  const [form, setForm] = useState<BusinessRule | null>(null);

  const fetchRules = async () => {
    setLoading(true);
    try {
      const response = await listBusinessRules({
        pageNum: query.pageNum,
        pageSize: query.pageSize,
        module: query.module || undefined,
        ruleCode: query.ruleCode || undefined,
        enabled: query.enabled === '' ? undefined : Number(query.enabled),
      });
      const normalized = normalizeListResponse(response);
      setRows(normalized.rows);
      setTotal(normalized.total);
    } catch (error) {
      toast.error(getErrorMessage(error, '加载业务规则失败'));
      setRows([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchRules();
  }, [query]);

  const handleSearch = (event: React.FormEvent) => {
    event.preventDefault();
    setQuery((current) => ({
      ...current,
      pageNum: 1,
      module: filters.module,
      ruleCode: filters.ruleCode.trim(),
      enabled: filters.enabled,
    }));
  };

  const handleReset = () => {
    setFilters({ module: '', ruleCode: '', enabled: '' });
    setQuery((current) => ({ ...current, pageNum: 1, module: '', ruleCode: '', enabled: '' }));
  };

  const openEdit = (rule: BusinessRule) => {
    setEditingRule(rule);
    setForm({ ...rule });
  };

  const closeEdit = () => {
    setEditingRule(null);
    setForm(null);
  };

  const saveRule = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form?.id) return;
    if (form.thresholdValue == null || Number.isNaN(Number(form.thresholdValue))) {
      toast.warning('请输入规则阈值');
      return;
    }
    try {
      await updateBusinessRule({
        ...form,
        thresholdValue: Number(form.thresholdValue),
        priority: Number(form.priority || 100),
      });
      toast.success('规则已更新');
      closeEdit();
      await fetchRules();
    } catch (error) {
      toast.error(getErrorMessage(error, '更新业务规则失败'));
    }
  };

  const toggleEnabled = async (rule: BusinessRule, checked: boolean) => {
    if (!rule.id) return;
    const previousRows = rows;
    setRows((current) => current.map((item) => item.id === rule.id ? { ...item, enabled: checked ? 1 : 0 } : item));
    try {
      await setBusinessRuleEnabled(rule.id, checked ? 1 : 0);
      toast.success(checked ? '规则已启用' : '规则已停用');
    } catch (error) {
      setRows(previousRows);
      toast.error(getErrorMessage(error, '规则启停失败'));
    }
  };

  const hasActiveFilters = Boolean(query.module || query.ruleCode || query.enabled);

  return (
    <>
      <TablePageLayout
        className="gap-3"
        filters={(
          <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-950/88">
            <form onSubmit={handleSearch} className="flex flex-1 flex-wrap items-center gap-3">
              <div className="relative w-full sm:w-56">
                <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <Input value={filters.ruleCode} onChange={(event) => setFilters((current) => ({ ...current, ruleCode: event.target.value }))} placeholder="规则编码" className="h-10 pl-10 font-mono" />
              </div>
              <Select value={filters.module || ALL_VALUE} onValueChange={(value) => setFilters((current) => ({ ...current, module: value === ALL_VALUE ? '' : value }))}>
                <SelectTrigger className="h-10 w-full sm:w-36"><SelectValue placeholder="模块" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_VALUE}>全部模块</SelectItem>
                  <SelectItem value="OA">OA</SelectItem>
                  <SelectItem value="HR">HR</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filters.enabled || ALL_VALUE} onValueChange={(value) => setFilters((current) => ({ ...current, enabled: value === ALL_VALUE ? '' : value }))}>
                <SelectTrigger className="h-10 w-full sm:w-36"><SelectValue placeholder="状态" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_VALUE}>全部状态</SelectItem>
                  <SelectItem value="1">启用</SelectItem>
                  <SelectItem value="0">停用</SelectItem>
                </SelectContent>
              </Select>
              <Button type="submit" size="sm">查询</Button>
              {hasActiveFilters ? <Button type="button" variant="outline" size="sm" onClick={handleReset}><RotateCcw size={14} />重置</Button> : null}
            </form>
            <Button variant="outline" size="sm" onClick={() => void fetchRules()} disabled={loading}>
              <RefreshCw size={15} className={cn(loading && 'animate-spin')} />
              刷新
            </Button>
          </div>
        )}
        table={(
          <div className="overflow-x-auto">
            <Table className="min-w-[980px]">
              <TableHeader>
                <TableRow>
                  <TableHead>规则</TableHead>
                  <TableHead>模块</TableHead>
                  <TableHead>阈值</TableHead>
                  <TableHead>效果</TableHead>
                  <TableHead>优先级</TableHead>
                  <TableHead>启用</TableHead>
                  <TableHead>备注</TableHead>
                  <TableActionHead className="w-24">操作</TableActionHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableStateRow colSpan={8} title="正在加载业务规则..." loading />
                ) : rows.length === 0 ? (
                  <TableStateRow colSpan={8} title="暂无业务规则" />
                ) : rows.map((rule) => (
                  <TableRow key={rule.id}>
                    <TableCell>
                      <div className="font-medium text-slate-900 dark:text-slate-100">{rule.ruleName}</div>
                      <code className="mt-1 block text-xs text-slate-500 dark:text-slate-400">{rule.ruleCode}</code>
                    </TableCell>
                    <TableCell>{rule.module}</TableCell>
                    <TableCell>{rule.thresholdValue ?? '-'}</TableCell>
                    <TableCell>
                      <span className={cn('rounded-full border px-2.5 py-1 text-xs font-medium', effectClassName[rule.effect])}>{rule.effect}</span>
                    </TableCell>
                    <TableCell>{rule.priority}</TableCell>
                    <TableCell>
                      <Switch checked={rule.enabled === 1} onCheckedChange={(checked) => void toggleEnabled(rule, checked)} />
                    </TableCell>
                    <TableCell className="max-w-[260px] truncate text-sm text-slate-500 dark:text-slate-400" title={rule.remark}>{rule.remark || '-'}</TableCell>
                    <TableCell>
                      <TableRowActions
                        align="end"
                        iconOnly
                        actions={[{ label: '编辑规则', icon: <Edit size={15} />, onClick: () => openEdit(rule), tone: 'neutral' }]}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        pagination={total > 0 ? (
          <Pagination
            total={total}
            page={query.pageNum}
            pageSize={query.pageSize}
            onPageChange={(pageNum) => setQuery((current) => ({ ...current, pageNum }))}
            onPageSizeChange={(pageSize) => setQuery((current) => ({ ...current, pageNum: 1, pageSize }))}
          />
        ) : null}
      />

      <BaseDialog
        open={Boolean(editingRule && form)}
        title="编辑业务规则"
        onClose={closeEdit}
        maxWidthClassName="max-w-2xl"
        footer={(
          <>
            <Button variant="outline" onClick={closeEdit}>取消</Button>
            <Button type="submit" form="business-rule-form">保存修改</Button>
          </>
        )}
      >
        {form ? (
          <form id="business-rule-form" onSubmit={saveRule} className="space-y-4">
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 dark:border-slate-800 dark:bg-slate-900/40">
              <div className="flex items-center gap-2 text-sm font-medium text-slate-900 dark:text-slate-100">
                <ListChecks size={16} />
                {editingRule?.ruleName}
              </div>
              <div className="mt-1 font-mono text-xs text-slate-500 dark:text-slate-400">{editingRule?.ruleCode}</div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className={fieldLabelClassName}>阈值</label>
                <Input type="number" step="0.01" value={form.thresholdValue ?? ''} onChange={(event) => setForm((current) => current ? { ...current, thresholdValue: Number(event.target.value) } : current)} />
              </div>
              <div>
                <label className={fieldLabelClassName}>命中效果</label>
                <Select value={form.effect} onValueChange={(value) => setForm((current) => current ? { ...current, effect: value as BusinessRule['effect'] } : current)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="WARN">WARN</SelectItem>
                    <SelectItem value="BLOCK">BLOCK</SelectItem>
                    <SelectItem value="PASS">PASS</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className={fieldLabelClassName}>优先级</label>
                <Input type="number" value={form.priority} onChange={(event) => setForm((current) => current ? { ...current, priority: Number(event.target.value) } : current)} />
              </div>
              <div>
                <label className={fieldLabelClassName}>启用状态</label>
                <div className="flex h-10 items-center gap-3">
                  <Switch checked={form.enabled === 1} onCheckedChange={(checked) => setForm((current) => current ? { ...current, enabled: checked ? 1 : 0 } : current)} />
                  <span className="text-sm text-slate-600 dark:text-slate-300">{form.enabled === 1 ? '启用' : '停用'}</span>
                </div>
              </div>
            </div>
            <div>
              <label className={fieldLabelClassName}>备注</label>
              <Textarea rows={3} value={form.remark || ''} onChange={(event) => setForm((current) => current ? { ...current, remark: event.target.value } : current)} />
            </div>
          </form>
        ) : null}
      </BaseDialog>
    </>
  );
};

export default BusinessRulePage;
