import React, { useEffect, useState } from 'react';
import { CheckCircle2, Edit, History, ListChecks, Play, RefreshCw, RotateCcw, Search, Undo2 } from 'lucide-react';
import { toast } from 'sonner';
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
  Switch,
  Table,
  TableActionHead,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
} from '@/components/common';
import { TablePageLayout } from '@/components/layout/TablePageLayout';
import { TableRowActions } from '@/components/common/table-row-actions';
import {
  BusinessRule,
  BusinessRuleHitRecord,
  BusinessRuleVersion,
  createBusinessRuleDraft,
  listBusinessRuleHitRecords,
  listBusinessRuleVersions,
  listBusinessRules,
  publishBusinessRuleVersion,
  rollbackBusinessRuleVersion,
  setBusinessRuleEnabled,
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

const statusClassName: Record<string, string> = {
  DRAFT: 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900 dark:bg-sky-950/30 dark:text-sky-200',
  PUBLISHED: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200',
  ARCHIVED: 'border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300',
};

const normalizeListResponse = <T,>(response: any) => {
  const rows = Array.isArray(response?.records)
    ? response.records
    : Array.isArray(response?.rows)
      ? response.rows
      : Array.isArray(response)
        ? response
        : [];
  return {
    rows: rows as T[],
    total: typeof response?.total === 'number' ? response.total : rows.length,
  };
};

const formatDateTime = (value?: string) => value ? value.replace('T', ' ').slice(0, 19) : '-';

const Badge: React.FC<{ value?: string; classNameMap?: Record<string, string> }> = ({ value, classNameMap = effectClassName }) => (
  <span className={cn('rounded-full border px-2.5 py-1 text-xs font-medium', classNameMap[value || ''] || statusClassName.ARCHIVED)}>
    {value || '-'}
  </span>
);

const TableStateRow: React.FC<{ colSpan: number; title: string; loading?: boolean }> = ({ colSpan, title, loading }) => (
  <TableRow className="hover:bg-transparent dark:hover:bg-transparent">
    <TableCell colSpan={colSpan} className="px-4 py-14 text-center">
      {loading ? <LoadingSpinner size="lg" className="mx-auto mb-3" /> : null}
      <div className="text-sm text-slate-500 dark:text-slate-400">{title}</div>
    </TableCell>
  </TableRow>
);

type ConfirmState =
  | { type: 'publish'; version: BusinessRuleVersion }
  | { type: 'rollback'; version: BusinessRuleVersion };

export const BusinessRulePage = () => {
  const [activeTab, setActiveTab] = useState('rules');
  const [rows, setRows] = useState<BusinessRule[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState({ pageNum: 1, pageSize: 10, module: '', ruleCode: '', enabled: '' });
  const [filters, setFilters] = useState({ module: '', ruleCode: '', enabled: '' });
  const [editingRule, setEditingRule] = useState<BusinessRule | null>(null);
  const [form, setForm] = useState<BusinessRule | null>(null);

  const [versions, setVersions] = useState<BusinessRuleVersion[]>([]);
  const [versionTotal, setVersionTotal] = useState(0);
  const [versionLoading, setVersionLoading] = useState(false);
  const [versionQuery, setVersionQuery] = useState({ pageNum: 1, pageSize: 10, ruleCode: '', status: '' });
  const [versionFilters, setVersionFilters] = useState({ ruleCode: '', status: '' });

  const [hits, setHits] = useState<BusinessRuleHitRecord[]>([]);
  const [hitTotal, setHitTotal] = useState(0);
  const [hitLoading, setHitLoading] = useState(false);
  const [hitQuery, setHitQuery] = useState({ pageNum: 1, pageSize: 10, ruleCode: '', businessType: '', hitResult: '' });
  const [hitFilters, setHitFilters] = useState({ ruleCode: '', businessType: '', hitResult: '' });
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);

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
      const normalized = normalizeListResponse<BusinessRule>(response);
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

  const fetchVersions = async () => {
    setVersionLoading(true);
    try {
      const response = await listBusinessRuleVersions({
        pageNum: versionQuery.pageNum,
        pageSize: versionQuery.pageSize,
        ruleCode: versionQuery.ruleCode || undefined,
        status: versionQuery.status || undefined,
      });
      const normalized = normalizeListResponse<BusinessRuleVersion>(response);
      setVersions(normalized.rows);
      setVersionTotal(normalized.total);
    } catch (error) {
      toast.error(getErrorMessage(error, '加载规则版本失败'));
      setVersions([]);
      setVersionTotal(0);
    } finally {
      setVersionLoading(false);
    }
  };

  const fetchHits = async () => {
    setHitLoading(true);
    try {
      const response = await listBusinessRuleHitRecords({
        pageNum: hitQuery.pageNum,
        pageSize: hitQuery.pageSize,
        ruleCode: hitQuery.ruleCode || undefined,
        businessType: hitQuery.businessType || undefined,
        hitResult: hitQuery.hitResult || undefined,
      });
      const normalized = normalizeListResponse<BusinessRuleHitRecord>(response);
      setHits(normalized.rows);
      setHitTotal(normalized.total);
    } catch (error) {
      toast.error(getErrorMessage(error, '加载命中记录失败'));
      setHits([]);
      setHitTotal(0);
    } finally {
      setHitLoading(false);
    }
  };

  useEffect(() => {
    void fetchRules();
  }, [query]);

  useEffect(() => {
    if (activeTab === 'versions') void fetchVersions();
  }, [activeTab, versionQuery]);

  useEffect(() => {
    if (activeTab === 'hits') void fetchHits();
  }, [activeTab, hitQuery]);

  const saveRule = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form?.id) return;
    if (form.thresholdValue == null || Number.isNaN(Number(form.thresholdValue))) {
      toast.warning('请输入规则阈值');
      return;
    }
    try {
      const draft = await createBusinessRuleDraft({
        ...form,
        thresholdValue: Number(form.thresholdValue),
        priority: Number(form.priority || 100),
      });
      toast.success(`草稿已生成：v${draft.versionNo}`);
      setEditingRule(null);
      setForm(null);
      setActiveTab('versions');
      setVersionQuery((current) => ({ ...current, pageNum: 1, ruleCode: form.ruleCode }));
      setVersionFilters((current) => ({ ...current, ruleCode: form.ruleCode }));
    } catch (error) {
      toast.error(getErrorMessage(error, '保存规则草稿失败'));
    }
  };

  const toggleEnabled = async (rule: BusinessRule, checked: boolean) => {
    if (!rule.id) return;
    const previousRows = rows;
    setRows((current) => current.map((item) => item.id === rule.id ? { ...item, enabled: checked ? 1 : 0 } : item));
    try {
      await setBusinessRuleEnabled(rule.id, checked ? 1 : 0);
      toast.success(checked ? '规则已启用' : '规则已停用');
      await fetchRules();
    } catch (error) {
      setRows(previousRows);
      toast.error(getErrorMessage(error, '规则启停失败'));
    }
  };

  const handleConfirm = async () => {
    if (!confirmState) return;
    const current = confirmState;
    setConfirmState(null);
    try {
      if (current.type === 'publish') {
        await publishBusinessRuleVersion(current.version.id);
        toast.success(`规则版本 v${current.version.versionNo} 已发布`);
      } else {
        await rollbackBusinessRuleVersion(current.version.ruleId, current.version.id);
        toast.success(`已回滚到 v${current.version.versionNo}`);
      }
      await Promise.all([fetchRules(), fetchVersions()]);
    } catch (error) {
      toast.error(getErrorMessage(error, current.type === 'publish' ? '发布失败' : '回滚失败'));
    }
  };

  const handleRuleSearch = (event: React.FormEvent) => {
    event.preventDefault();
    setQuery((current) => ({ ...current, pageNum: 1, ...filters }));
  };

  const handleVersionSearch = (event: React.FormEvent) => {
    event.preventDefault();
    setVersionQuery((current) => ({ ...current, pageNum: 1, ruleCode: versionFilters.ruleCode.trim(), status: versionFilters.status }));
  };

  const handleHitSearch = (event: React.FormEvent) => {
    event.preventDefault();
    setHitQuery((current) => ({ ...current, pageNum: 1, ruleCode: hitFilters.ruleCode.trim(), businessType: hitFilters.businessType.trim(), hitResult: hitFilters.hitResult }));
  };

  const renderRuleFilters = (
    <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-950/88">
      <form onSubmit={handleRuleSearch} className="flex flex-1 flex-wrap items-center gap-3">
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
        <Button type="button" variant="outline" size="sm" onClick={() => { setFilters({ module: '', ruleCode: '', enabled: '' }); setQuery((current) => ({ ...current, pageNum: 1, module: '', ruleCode: '', enabled: '' })); }}>
          <RotateCcw size={14} />重置
        </Button>
      </form>
      <Button variant="outline" size="sm" onClick={() => void fetchRules()} disabled={loading}>
        <RefreshCw size={15} className={cn(loading && 'animate-spin')} />刷新
      </Button>
    </div>
  );

  const renderRuleTable = (
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
              <TableCell><Badge value={rule.effect} /></TableCell>
              <TableCell>{rule.priority}</TableCell>
              <TableCell>
                <Switch checked={rule.enabled === 1} onCheckedChange={(checked) => void toggleEnabled(rule, checked)} />
              </TableCell>
              <TableCell className="max-w-[260px] truncate text-sm text-slate-500 dark:text-slate-400" title={rule.remark}>{rule.remark || '-'}</TableCell>
              <TableCell>
                <TableRowActions
                  align="end"
                  actions={[{ label: '编辑规则', icon: <Edit size={15} />, onClick: () => { setEditingRule(rule); setForm({ ...rule }); }, tone: 'neutral' }]}
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );

  return (
    <>
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-3">
        <TabsList className="w-fit">
          <TabsTrigger value="rules"><ListChecks size={15} className="mr-1" />规则</TabsTrigger>
          <TabsTrigger value="versions"><History size={15} className="mr-1" />版本</TabsTrigger>
          <TabsTrigger value="hits"><CheckCircle2 size={15} className="mr-1" />命中记录</TabsTrigger>
        </TabsList>

        <TabsContent value="rules" className="mt-0">
          <TablePageLayout
            className="gap-3"
            filters={renderRuleFilters}
            table={renderRuleTable}
            pagination={total > 0 ? (
              <Pagination total={total} page={query.pageNum} pageSize={query.pageSize} onPageChange={(pageNum) => setQuery((current) => ({ ...current, pageNum }))} onPageSizeChange={(pageSize) => setQuery((current) => ({ ...current, pageNum: 1, pageSize }))} />
            ) : null}
          />
        </TabsContent>

        <TabsContent value="versions" className="mt-0">
          <TablePageLayout
            filters={(
              <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-950/88">
                <form onSubmit={handleVersionSearch} className="flex flex-1 flex-wrap items-center gap-3">
                  <Input value={versionFilters.ruleCode} onChange={(event) => setVersionFilters((current) => ({ ...current, ruleCode: event.target.value }))} placeholder="规则编码" className="h-10 w-full font-mono sm:w-56" />
                  <Select value={versionFilters.status || ALL_VALUE} onValueChange={(value) => setVersionFilters((current) => ({ ...current, status: value === ALL_VALUE ? '' : value }))}>
                    <SelectTrigger className="h-10 w-full sm:w-40"><SelectValue placeholder="版本状态" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ALL_VALUE}>全部状态</SelectItem>
                      <SelectItem value="DRAFT">草稿</SelectItem>
                      <SelectItem value="PUBLISHED">已发布</SelectItem>
                      <SelectItem value="ARCHIVED">已归档</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button type="submit" size="sm">查询</Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => { setVersionFilters({ ruleCode: '', status: '' }); setVersionQuery((current) => ({ ...current, pageNum: 1, ruleCode: '', status: '' })); }}>
                    <RotateCcw size={14} />重置
                  </Button>
                </form>
                <Button variant="outline" size="sm" onClick={() => void fetchVersions()} disabled={versionLoading}>
                  <RefreshCw size={15} className={cn(versionLoading && 'animate-spin')} />刷新
                </Button>
              </div>
            )}
            table={(
              <div className="overflow-x-auto">
                <Table className="min-w-[1050px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead>版本</TableHead>
                      <TableHead>规则编码</TableHead>
                      <TableHead>阈值</TableHead>
                      <TableHead>效果</TableHead>
                      <TableHead>状态</TableHead>
                      <TableHead>发布人</TableHead>
                      <TableHead>发布时间</TableHead>
                      <TableHead>备注</TableHead>
                      <TableActionHead className="w-28">操作</TableActionHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {versionLoading ? (
                      <TableStateRow colSpan={9} title="正在加载规则版本..." loading />
                    ) : versions.length === 0 ? (
                      <TableStateRow colSpan={9} title="暂无规则版本" />
                    ) : versions.map((version) => (
                      <TableRow key={version.id}>
                        <TableCell>v{version.versionNo}</TableCell>
                        <TableCell className="font-mono text-xs">{version.ruleCode}</TableCell>
                        <TableCell>{version.thresholdValue ?? '-'}</TableCell>
                        <TableCell><Badge value={version.effect} /></TableCell>
                        <TableCell><Badge value={version.status} classNameMap={statusClassName} /></TableCell>
                        <TableCell>{version.publisherName || '-'}</TableCell>
                        <TableCell>{formatDateTime(version.publishedTime)}</TableCell>
                        <TableCell className="max-w-[240px] truncate text-sm text-slate-500" title={version.remark}>{version.remark || '-'}</TableCell>
                        <TableCell>
                          <TableRowActions
                            align="end"
                            actions={[
                              { label: '发布版本', icon: <Play size={15} />, hidden: version.status !== 'DRAFT', onClick: () => setConfirmState({ type: 'publish', version }), tone: 'success' },
                              { label: '回滚版本', icon: <Undo2 size={15} />, hidden: version.status === 'DRAFT', onClick: () => setConfirmState({ type: 'rollback', version }), tone: 'warning' },
                            ]}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
            pagination={versionTotal > 0 ? (
              <Pagination total={versionTotal} page={versionQuery.pageNum} pageSize={versionQuery.pageSize} onPageChange={(pageNum) => setVersionQuery((current) => ({ ...current, pageNum }))} onPageSizeChange={(pageSize) => setVersionQuery((current) => ({ ...current, pageNum: 1, pageSize }))} />
            ) : null}
          />
        </TabsContent>

        <TabsContent value="hits" className="mt-0">
          <TablePageLayout
            filters={(
              <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-950/88">
                <form onSubmit={handleHitSearch} className="flex flex-1 flex-wrap items-center gap-3">
                  <Input value={hitFilters.ruleCode} onChange={(event) => setHitFilters((current) => ({ ...current, ruleCode: event.target.value }))} placeholder="规则编码" className="h-10 w-full font-mono sm:w-56" />
                  <Input value={hitFilters.businessType} onChange={(event) => setHitFilters((current) => ({ ...current, businessType: event.target.value }))} placeholder="业务类型" className="h-10 w-full sm:w-40" />
                  <Select value={hitFilters.hitResult || ALL_VALUE} onValueChange={(value) => setHitFilters((current) => ({ ...current, hitResult: value === ALL_VALUE ? '' : value }))}>
                    <SelectTrigger className="h-10 w-full sm:w-36"><SelectValue placeholder="结果" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ALL_VALUE}>全部结果</SelectItem>
                      <SelectItem value="BLOCK">BLOCK</SelectItem>
                      <SelectItem value="WARN">WARN</SelectItem>
                      <SelectItem value="PASS">PASS</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button type="submit" size="sm">查询</Button>
                </form>
                <Button variant="outline" size="sm" onClick={() => void fetchHits()} disabled={hitLoading}>
                  <RefreshCw size={15} className={cn(hitLoading && 'animate-spin')} />刷新
                </Button>
              </div>
            )}
            table={(
              <div className="overflow-x-auto">
                <Table className="min-w-[980px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead>规则编码</TableHead>
                      <TableHead>业务</TableHead>
                      <TableHead>阈值</TableHead>
                      <TableHead>实际值</TableHead>
                      <TableHead>效果</TableHead>
                      <TableHead>结果</TableHead>
                      <TableHead>命中时间</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {hitLoading ? (
                      <TableStateRow colSpan={7} title="正在加载命中记录..." loading />
                    ) : hits.length === 0 ? (
                      <TableStateRow colSpan={7} title="暂无命中记录" />
                    ) : hits.map((hit) => (
                      <TableRow key={hit.id}>
                        <TableCell className="font-mono text-xs">{hit.ruleCode}</TableCell>
                        <TableCell>{hit.businessType}#{hit.businessId || '-'}</TableCell>
                        <TableCell>{hit.thresholdValue ?? '-'}</TableCell>
                        <TableCell>{hit.actualValue ?? '-'}</TableCell>
                        <TableCell><Badge value={hit.effect} /></TableCell>
                        <TableCell><Badge value={hit.hitResult} /></TableCell>
                        <TableCell>{formatDateTime(hit.createdTime)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
            pagination={hitTotal > 0 ? (
              <Pagination total={hitTotal} page={hitQuery.pageNum} pageSize={hitQuery.pageSize} onPageChange={(pageNum) => setHitQuery((current) => ({ ...current, pageNum }))} onPageSizeChange={(pageSize) => setHitQuery((current) => ({ ...current, pageNum: 1, pageSize }))} />
            ) : null}
          />
        </TabsContent>
      </Tabs>

      <BaseDialog
        open={Boolean(editingRule && form)}
        title="保存规则草稿"
        onClose={() => { setEditingRule(null); setForm(null); }}
        maxWidthClassName="max-w-2xl"
        footer={(
          <>
            <Button variant="outline" onClick={() => { setEditingRule(null); setForm(null); }}>取消</Button>
            <Button type="submit" form="business-rule-form">生成草稿</Button>
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

      <ConfirmDialog
        open={Boolean(confirmState)}
        title={confirmState?.type === 'publish' ? '发布规则版本' : '回滚规则版本'}
        message={confirmState ? `${confirmState.version.ruleCode} v${confirmState.version.versionNo}` : ''}
        confirmText={confirmState?.type === 'publish' ? '发布' : '回滚'}
        cancelText="取消"
        onConfirm={() => void handleConfirm()}
        onCancel={() => setConfirmState(null)}
      />
    </>
  );
};

export default BusinessRulePage;

