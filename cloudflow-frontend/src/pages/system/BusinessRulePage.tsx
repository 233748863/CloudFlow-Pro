import React, { useEffect, useMemo, useState } from 'react';
import { getConfigIntSync } from '../../hooks/useSystemConfig';
import { SYS_PAGE_DEFAULT_PAGE_SIZE } from '../../constants/sysConfig';
import { CheckCircle2, Edit, History, ListChecks, Play, RefreshCw, RotateCcw, Search, Undo2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  BaseDialog,
  Button,
  ConfirmDialog,
  Input,
  Label,
  LoadingSpinner,
  Pagination,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  Textarea,
} from '@/components/common';
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
import { useDict } from '@/hooks/useDict';
import { DictBadge } from '@/components/common/DictBadge';
import { InnerTableSurface, TablePageLayout } from '@/components/layout/TablePageLayout';

const ALL_VALUE = '__all__';

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

const TableStateRow: React.FC<{ colSpan: number; title: string; loading?: boolean }> = ({ colSpan, title, loading }) => (
  <tr>
    <td colSpan={colSpan} className="px-4 py-10 text-center">
      {loading ? <LoadingSpinner size="lg" className="mx-auto mb-3" /> : null}
      <div className="text-sm text-slate-500 dark:text-slate-400">{title}</div>
    </td>
  </tr>
);

type ConfirmState =
  | { type: 'publish'; version: BusinessRuleVersion }
  | { type: 'rollback'; version: BusinessRuleVersion };

export const BusinessRulePage = () => {
  const [activeTab, setActiveTab] = useState('rules');
  const workflowDefStatusDict = useDict('workflow_definition_status');
  const effectDict = useDict('oa_business_rule_effect');
  const [rows, setRows] = useState<BusinessRule[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState({ pageNum: 1, pageSize: getConfigIntSync(SYS_PAGE_DEFAULT_PAGE_SIZE, 10), module: '', ruleCode: '', enabled: '' });
  const [filters, setFilters] = useState({ module: '', ruleCode: '', enabled: '' });
  const [editingRule, setEditingRule] = useState<BusinessRule | null>(null);
  const [form, setForm] = useState<BusinessRule | null>(null);

  const [versions, setVersions] = useState<BusinessRuleVersion[]>([]);
  const [versionTotal, setVersionTotal] = useState(0);
  const [versionLoading, setVersionLoading] = useState(false);
  const [versionQuery, setVersionQuery] = useState({ pageNum: 1, pageSize: getConfigIntSync(SYS_PAGE_DEFAULT_PAGE_SIZE, 10), ruleCode: '', status: '' });
  const [versionFilters, setVersionFilters] = useState({ ruleCode: '', status: '' });

  const [hits, setHits] = useState<BusinessRuleHitRecord[]>([]);
  const [hitTotal, setHitTotal] = useState(0);
  const [hitLoading, setHitLoading] = useState(false);
  const [hitQuery, setHitQuery] = useState({ pageNum: 1, pageSize: getConfigIntSync(SYS_PAGE_DEFAULT_PAGE_SIZE, 10), ruleCode: '', businessType: '', hitResult: '' });
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

  const renderRuleTable = (
    <InnerTableSurface>
      <table className="unity-data-table admin-source-table min-w-[980px]">
        <thead>
          <tr>
            <th>规则</th>
            <th>模块</th>
            <th>阈值</th>
            <th>效果</th>
            <th>优先级</th>
            <th>启用</th>
            <th>备注</th>
            <th className="text-right">操作</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <TableStateRow colSpan={8} title="正在加载业务规则..." loading />
          ) : rows.length === 0 ? (
            <TableStateRow colSpan={8} title="暂无业务规则" />
          ) : rows.map((rule) => (
            <tr key={rule.id}>
              <td>
                <div className="font-medium text-slate-900 dark:text-slate-100">{rule.ruleName}</div>
                <code className="mt-1 block text-xs text-slate-500 dark:text-slate-400">{rule.ruleCode}</code>
              </td>
              <td>{rule.module}</td>
              <td>{rule.thresholdValue ?? '-'}</td>
              <td><DictBadge dictType="oa_business_rule_effect" value={String(rule.effect || '')} /></td>
              <td>{rule.priority}</td>
              <td>
                <Switch checked={rule.enabled === 1} onCheckedChange={(checked) => void toggleEnabled(rule, checked)} />
              </td>
              <td className="max-w-[260px] truncate text-sm text-slate-500 dark:text-slate-400" title={rule.remark}>{rule.remark || '-'}</td>
              <td>
                <div className="admin-users-row-actions">
                  <button
                    type="button"
                    title="编辑规则"
                    onClick={() => {
                      setEditingRule(rule);
                      setForm({ ...rule });
                    }}
                  >
                    <Edit size={15} />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </InnerTableSurface>
  );

  const stats = useMemo(
    () => [
      {
        label: '业务规则',
        value: String(total),
        meta: '规则配置',
        icon: <ListChecks size={18} />,
        tone: 'blue',
      },
      {
        label: '启用规则',
        value: String(rows.filter((rule) => rule.enabled === 1).length),
        meta: '当前页',
        icon: <CheckCircle2 size={18} />,
        tone: 'green',
      },
      {
        label: '规则版本',
        value: String(versionTotal),
        meta: '发布记录',
        icon: <History size={18} />,
        tone: 'amber',
      },
      {
        label: '命中记录',
        value: String(hitTotal),
        meta: '审计追踪',
        icon: <Play size={18} />,
        tone: 'violet',
      },
    ],
    [hitTotal, rows, total, versionTotal],
  );

  const pageActions = (
    <>
      <header className="admin-source-header">
        <div>
          <p className="admin-source-kicker">BUSINESS RULES</p>
          <h2>业务规则</h2>
          <span>维护规则阈值、发布版本、回滚记录和命中审计</span>
        </div>
        <div className="admin-source-controls">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              if (activeTab === 'rules') void fetchRules();
              if (activeTab === 'versions') void fetchVersions();
              if (activeTab === 'hits') void fetchHits();
            }}
            disabled={loading || versionLoading || hitLoading}
          >
            <RefreshCw size={16} className={cn((loading || versionLoading || hitLoading) && 'animate-spin')} />
            刷新
          </Button>
        </div>
      </header>

      <section className="admin-source-stat-grid">
        {stats.map((stat) => (
          <article key={stat.label} className={cn('card admin-source-stat', `admin-source-tone-${stat.tone}`)}>
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
      <div className="admin-source-tabs">
        <button type="button" className={cn(activeTab === 'rules' && 'active')} onClick={() => setActiveTab('rules')}>
          <ListChecks size={15} />规则
        </button>
        <button type="button" className={cn(activeTab === 'versions' && 'active')} onClick={() => setActiveTab('versions')}>
          <History size={15} />版本
        </button>
        <button type="button" className={cn(activeTab === 'hits' && 'active')} onClick={() => setActiveTab('hits')}>
          <CheckCircle2 size={15} />命中记录
        </button>
      </div>

      {activeTab === 'rules' ? (
        <form onSubmit={handleRuleSearch} className="admin-business-rules-filter-grid">
          <label className="admin-source-search">
            <span className="input-label">规则编码</span>
            <div className="admin-source-search-field">
              <Search size={16} />
              <Input
                value={filters.ruleCode}
                onChange={(event) => setFilters((current) => ({ ...current, ruleCode: event.target.value }))}
                placeholder="规则编码"
                type="search"
                className="font-mono"
              />
            </div>
          </label>
          <label>
            <span className="input-label">模块</span>
            <Select value={filters.module || ALL_VALUE} onValueChange={(value) => setFilters((current) => ({ ...current, module: value === ALL_VALUE ? '' : value }))}>
              <SelectTrigger className="h-[42px]"><SelectValue placeholder="全部模块" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_VALUE}>全部模块</SelectItem>
                <SelectItem value="OA">OA</SelectItem>
                <SelectItem value="HR">HR</SelectItem>
              </SelectContent>
            </Select>
          </label>
          <label>
            <span className="input-label">状态</span>
            <Select value={filters.enabled || ALL_VALUE} onValueChange={(value) => setFilters((current) => ({ ...current, enabled: value === ALL_VALUE ? '' : value }))}>
              <SelectTrigger className="h-[42px]"><SelectValue placeholder="全部状态" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_VALUE}>全部状态</SelectItem>
                <SelectItem value="1">启用</SelectItem>
                <SelectItem value="0">停用</SelectItem>
              </SelectContent>
            </Select>
          </label>
          <div className="admin-users-toolbar-actions">
            <span className="admin-users-filter-count">当前 {total} 项</span>
            <Button type="submit" size="sm">查询</Button>
            <Button type="button" variant="outline" size="sm" onClick={() => { setFilters({ module: '', ruleCode: '', enabled: '' }); setQuery((current) => ({ ...current, pageNum: 1, module: '', ruleCode: '', enabled: '' })); }}>
              <RotateCcw size={14} />重置
            </Button>
          </div>
        </form>
      ) : null}

      {activeTab === 'versions' ? (
        <form onSubmit={handleVersionSearch} className="admin-business-versions-filter-grid">
          <label className="admin-source-search">
            <span className="input-label">规则编码</span>
            <div className="admin-source-search-field">
              <Search size={16} />
              <Input
                value={versionFilters.ruleCode}
                onChange={(event) => setVersionFilters((current) => ({ ...current, ruleCode: event.target.value }))}
                placeholder="规则编码"
                type="search"
                className="font-mono"
              />
            </div>
          </label>
          <label>
            <span className="input-label">版本状态</span>
            <Select value={versionFilters.status || ALL_VALUE} onValueChange={(value) => setVersionFilters((current) => ({ ...current, status: value === ALL_VALUE ? '' : value }))}>
              <SelectTrigger className="h-[42px]"><SelectValue placeholder="全部状态" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_VALUE}>全部状态</SelectItem>
                {(workflowDefStatusDict.data || []).map((item) => (
                  <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <div className="admin-users-toolbar-actions">
            <span className="admin-users-filter-count">当前 {versionTotal} 项</span>
            <Button type="submit" size="sm">查询</Button>
            <Button type="button" variant="outline" size="sm" onClick={() => { setVersionFilters({ ruleCode: '', status: '' }); setVersionQuery((current) => ({ ...current, pageNum: 1, ruleCode: '', status: '' })); }}>
              <RotateCcw size={14} />重置
            </Button>
          </div>
        </form>
      ) : null}

      {activeTab === 'hits' ? (
        <form onSubmit={handleHitSearch} className="admin-business-hits-filter-grid">
          <label className="admin-source-search">
            <span className="input-label">规则编码</span>
            <div className="admin-source-search-field">
              <Search size={16} />
              <Input
                value={hitFilters.ruleCode}
                onChange={(event) => setHitFilters((current) => ({ ...current, ruleCode: event.target.value }))}
                placeholder="规则编码"
                type="search"
                className="font-mono"
              />
            </div>
          </label>
          <label>
            <span className="input-label">业务类型</span>
            <Input value={hitFilters.businessType} onChange={(event) => setHitFilters((current) => ({ ...current, businessType: event.target.value }))} placeholder="业务类型" />
          </label>
          <label>
            <span className="input-label">命中结果</span>
            <Select value={hitFilters.hitResult || ALL_VALUE} onValueChange={(value) => setHitFilters((current) => ({ ...current, hitResult: value === ALL_VALUE ? '' : value }))}>
              <SelectTrigger className="h-[42px]"><SelectValue placeholder="全部结果" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_VALUE}>全部结果</SelectItem>
                {effectDict.getOptions().map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <div className="admin-users-toolbar-actions">
            <span className="admin-users-filter-count">当前 {hitTotal} 项</span>
            <Button type="submit" size="sm">查询</Button>
          </div>
        </form>
      ) : null}
    </section>
  );

  const versionTable = (
    <InnerTableSurface>
      <table className="unity-data-table admin-source-table min-w-[1050px]">
        <thead>
          <tr>
            <th>版本</th>
            <th>规则编码</th>
            <th>阈值</th>
            <th>效果</th>
            <th>状态</th>
            <th>发布人</th>
            <th>发布时间</th>
            <th>备注</th>
            <th className="text-right">操作</th>
          </tr>
        </thead>
        <tbody>
          {versionLoading ? (
            <TableStateRow colSpan={9} title="正在加载规则版本..." loading />
          ) : versions.length === 0 ? (
            <TableStateRow colSpan={9} title="暂无规则版本" />
          ) : versions.map((version) => (
            <tr key={version.id}>
              <td>v{version.versionNo}</td>
              <td className="font-mono text-xs">{version.ruleCode}</td>
              <td>{version.thresholdValue ?? '-'}</td>
              <td><DictBadge dictType="oa_business_rule_effect" value={String(version.effect || '')} /></td>
              <td><DictBadge dictType="workflow_definition_status" value={version.status || ''} /></td>
              <td>{version.publisherName || '-'}</td>
              <td>{formatDateTime(version.publishedTime)}</td>
              <td className="max-w-[240px] truncate text-sm text-slate-500" title={version.remark}>{version.remark || '-'}</td>
              <td>
                <div className="admin-users-row-actions">
                  {version.status === 'DRAFT' ? (
                    <button type="button" title="发布版本" onClick={() => setConfirmState({ type: 'publish', version })}>
                      <Play size={15} />
                    </button>
                  ) : null}
                  {version.status !== 'DRAFT' ? (
                    <button type="button" title="回滚版本" onClick={() => setConfirmState({ type: 'rollback', version })}>
                      <Undo2 size={15} />
                    </button>
                  ) : null}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </InnerTableSurface>
  );

  const hitTable = (
    <InnerTableSurface>
      <table className="unity-data-table admin-source-table min-w-[980px]">
        <thead>
          <tr>
            <th>规则编码</th>
            <th>业务</th>
            <th>阈值</th>
            <th>实际值</th>
            <th>效果</th>
            <th>结果</th>
            <th>命中时间</th>
          </tr>
        </thead>
        <tbody>
          {hitLoading ? (
            <TableStateRow colSpan={7} title="正在加载命中记录..." loading />
          ) : hits.length === 0 ? (
            <TableStateRow colSpan={7} title="暂无命中记录" />
          ) : hits.map((hit) => (
            <tr key={hit.id}>
              <td className="font-mono text-xs">{hit.ruleCode}</td>
              <td>{hit.businessType}#{hit.businessId || '-'}</td>
              <td>{hit.thresholdValue ?? '-'}</td>
              <td>{hit.actualValue ?? '-'}</td>
              <td><DictBadge dictType="oa_business_rule_effect" value={String(hit.effect || '')} /></td>
              <td><DictBadge dictType="oa_business_rule_hit_result" value={String(hit.hitResult || '')} /></td>
              <td>{formatDateTime(hit.createdTime)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </InnerTableSurface>
  );

  const pageTable =
    activeTab === 'rules' ? renderRuleTable : activeTab === 'versions' ? versionTable : hitTable;

  const pagePagination =
    activeTab === 'rules' && total > 0 ? (
      <Pagination total={total} page={query.pageNum} pageSize={query.pageSize} onPageChange={(pageNum) => setQuery((current) => ({ ...current, pageNum }))} onPageSizeChange={(pageSize) => setQuery((current) => ({ ...current, pageNum: 1, pageSize }))} />
    ) : activeTab === 'versions' && versionTotal > 0 ? (
      <Pagination total={versionTotal} page={versionQuery.pageNum} pageSize={versionQuery.pageSize} onPageChange={(pageNum) => setVersionQuery((current) => ({ ...current, pageNum }))} onPageSizeChange={(pageSize) => setVersionQuery((current) => ({ ...current, pageNum: 1, pageSize }))} />
    ) : activeTab === 'hits' && hitTotal > 0 ? (
      <Pagination total={hitTotal} page={hitQuery.pageNum} pageSize={hitQuery.pageSize} onPageChange={(pageNum) => setHitQuery((current) => ({ ...current, pageNum }))} onPageSizeChange={(pageSize) => setHitQuery((current) => ({ ...current, pageNum: 1, pageSize }))} />
    ) : null;

  return (
    <>
      <section className="admin-source-page admin-business-rules-page">
        <TablePageLayout
          actions={pageActions}
          filters={pageFilters}
          table={pageTable}
          pagination={pagePagination}
        />
      </section>

      <BaseDialog
        open={Boolean(editingRule && form)}
        title="保存规则草稿"
        onClose={() => { setEditingRule(null); setForm(null); }}
        maxWidthClassName="max-w-2xl"
        bodyClassName="admin-dialog-stack"
        footer={(
          <>
            <Button variant="outline" onClick={() => { setEditingRule(null); setForm(null); }}>取消</Button>
            <Button type="submit" form="business-rule-form">生成草稿</Button>
          </>
        )}
      >
        {form ? (
          <form id="business-rule-form" onSubmit={saveRule} className="admin-dialog-stack">
            <div className="rounded-md border border-slate-200 bg-[var(--cf-surface-strong)] px-3 py-3 dark:border-slate-800 dark:bg-slate-950">
              <div className="flex items-center gap-2 text-sm font-medium text-slate-900 dark:text-slate-100">
                <ListChecks size={16} />
                {editingRule?.ruleName}
              </div>
              <div className="mt-1 font-mono text-xs text-slate-500 dark:text-slate-400">{editingRule?.ruleCode}</div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="admin-dialog-field">
                <Label>阈值</Label>
                <Input type="number" step="0.01" value={form.thresholdValue ?? ''} onChange={(event) => setForm((current) => current ? { ...current, thresholdValue: Number(event.target.value) } : current)} />
              </div>
              <div className="admin-dialog-field">
                <Label>命中效果</Label>
                <Select value={form.effect} onValueChange={(value) => setForm((current) => current ? { ...current, effect: value as BusinessRule['effect'] } : current)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {effectDict.getOptions().map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="admin-dialog-field">
                <Label>优先级</Label>
                <Input type="number" value={form.priority} onChange={(event) => setForm((current) => current ? { ...current, priority: Number(event.target.value) } : current)} />
              </div>
              <div className="admin-dialog-field">
                <Label>启用状态</Label>
                <div className="flex h-10 items-center gap-3">
                  <Switch checked={form.enabled === 1} onCheckedChange={(checked) => setForm((current) => current ? { ...current, enabled: checked ? 1 : 0 } : current)} />
                  <span className="text-sm text-slate-600 dark:text-slate-300">{form.enabled === 1 ? '启用' : '停用'}</span>
                </div>
              </div>
            </div>
            <div className="admin-dialog-field">
              <Label>备注</Label>
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
