import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowRight, FileText, LayoutGrid, Search, Tags } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import type { FormDefinition, WorkflowDefinition } from '@/types';
import { Role } from '@/types';
import { useAuth } from '@/context/AuthContext';
import {
  WorkflowLaunchDialog,
  mapWorkflowBackendForm,
  normalizeWorkflowTags,
} from '@/components/workflow/catalog';
import {
  getFormDefinition,
  getFormDefinitions,
  getProcessDefinitions,
  startProcess,
} from '@/services/api/workflow';
import { parseWorkflowGraphDefinition } from '@/utils/workflowGraph';
import {
  WORKFLOW_CATEGORY_OPTIONS,
  getWorkflowCategoryLabel,
  normalizeWorkflowCategory,
} from '@/utils/workflowCategory';
import {
  Button,
  EmptyState,
  FilterChip,
  Input,
  PageLoading,
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
} from '@/components/common';
import { InnerTableSurface, TablePageLayout } from '@/components/layout/TablePageLayout';

const parseWorkflowGraph = (
  rawModelJson: unknown,
  workflowName: string,
): WorkflowDefinition['graph'] => {
  const graph = parseWorkflowGraphDefinition(rawModelJson);
  if (!graph) {
    throw new Error(`流程 "${workflowName}" 的 modelJson 不是合法的 nodes+edges 图模型`);
  }
  return graph;
};

const getApiErrorMessage = (error: unknown, fallback: string): string => {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
};

export const Workplace = () => {
  const [workflows, setWorkflows] = useState<WorkflowDefinition[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [targetWorkflow, setTargetWorkflow] = useState<WorkflowDefinition | null>(null);
  const [savedForms, setSavedForms] = useState<FormDefinition[]>([]);
  const [loadingBoundForm, setLoadingBoundForm] = useState(false);
  const [boundFormError, setBoundFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [invalidModelCount, setInvalidModelCount] = useState(0);
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        const response = await getProcessDefinitions({ status: 'PUBLISHED', latestOnly: false });
        if (Array.isArray(response)) {
          const publishedOnly = response.some((item: any) => !!item?.status)
            ? response.filter((item: any) => String(item?.status || '').toUpperCase() === 'PUBLISHED')
            : response;

          const latestPublishedMap = new Map<string, any>();
          for (const item of publishedOnly) {
            const processKey = String(item?.processKey || '').trim();
            if (!processKey) continue;
            const current = latestPublishedMap.get(processKey);
            const currentVersion = Number(current?.version || 0);
            const nextVersion = Number(item?.version || 0);
            if (!current || nextVersion >= currentVersion) {
              latestPublishedMap.set(processKey, item);
            }
          }

          let skippedModelCount = 0;
          const mapped: WorkflowDefinition[] = Array.from(latestPublishedMap.values())
            .filter(
              (item: any) =>
                typeof item?.definitionId === 'string' && item.definitionId.trim() !== '',
            )
            .filter((item: any) => typeof item?.processKey === 'string' && item.processKey.trim() !== '')
            .map((item: any): WorkflowDefinition | null => {
              const workflowName = item.processName || item.processKey || '未命名流程';
              try {
                return {
                  id: item.definitionId,
                  name: workflowName,
                  key: item.processKey,
                  version: item.version,
                  formId: item.formId,
                  category: normalizeWorkflowCategory(item.category),
                  tags:
                    typeof item.tags === 'string'
                      ? item.tags
                      : JSON.stringify(normalizeWorkflowTags(item.tags)),
                  description: item.description || '',
                  graph: parseWorkflowGraph(item.modelJson, workflowName),
                };
              } catch (error) {
                skippedModelCount += 1;
                console.warn(`[Workplace] 跳过模型异常流程: ${workflowName}`, error);
                return null;
              }
            })
            .filter((item): item is WorkflowDefinition => item !== null);

          setWorkflows(mapped);
          setInvalidModelCount(skippedModelCount);
        } else {
          setWorkflows([]);
          setInvalidModelCount(0);
        }
      } catch (error) {
        console.error('加载流程列表失败:', error);
        toast.error('加载流程列表失败，请稍后重试');
        setWorkflows([]);
        setInvalidModelCount(0);
      } finally {
        setLoading(false);
      }
    };

    void loadData();

    if (!user || user.role !== Role.ADMIN) {
      setSavedForms([]);
      return;
    }

    void getFormDefinitions()
      .then((response) => {
        if (Array.isArray(response)) {
          setSavedForms(response.map((item: any) => mapWorkflowBackendForm(item)));
        }
      })
      .catch(() => {
        setSavedForms([]);
      });
  }, [user]);

  useEffect(() => {
    if (!isFormOpen || !targetWorkflow?.formId) {
      setLoadingBoundForm(false);
      setBoundFormError(null);
      return;
    }

    const formId = targetWorkflow.formId;
    if (savedForms.some((form) => form.id === formId)) {
      setLoadingBoundForm(false);
      setBoundFormError(null);
      return;
    }

    let cancelled = false;
    setLoadingBoundForm(true);
    setBoundFormError(null);

    void getFormDefinition(formId)
      .then((response) => {
        if (cancelled) return;
        const mapped = mapWorkflowBackendForm(response);
        setSavedForms((prev) => {
          const exists = prev.some((item) => item.id === mapped.id);
          if (exists) {
            return prev.map((item) => (item.id === mapped.id ? mapped : item));
          }
          return [...prev, mapped];
        });
      })
      .catch((error) => {
        if (cancelled) return;
        setBoundFormError(error instanceof Error ? error.message : '加载绑定表单失败');
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingBoundForm(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isFormOpen, savedForms, targetWorkflow?.formId]);

  const filteredWorkflows = useMemo(
    () =>
      workflows.filter((workflow) => {
        const matchesSearch = workflow.name.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesCategory = !selectedCategory || workflow.category === selectedCategory;
        const workflowTags = normalizeWorkflowTags(workflow.tags);
        const matchesTags =
          selectedTags.length === 0 || selectedTags.some((tag) => workflowTags.includes(tag));

        return matchesSearch && matchesCategory && matchesTags;
      }),
    [searchTerm, selectedCategory, selectedTags, workflows],
  );

  const allTags = useMemo(
    () => Array.from(new Set(workflows.flatMap((workflow) => normalizeWorkflowTags(workflow.tags)))),
    [workflows],
  );

  const categoryFilters = useMemo(
    () => [{ label: '全部', value: '' }, ...WORKFLOW_CATEGORY_OPTIONS],
    [],
  );
  const selectedCategoryLabel = categoryFilters.find((item) => item.value === selectedCategory)?.label || '全部';

  const boundForm = targetWorkflow?.formId
    ? savedForms.find((form) => form.id === targetWorkflow.formId)
    : undefined;

  const hasActiveFilters = Boolean(searchTerm || selectedCategory || selectedTags.length > 0);
  const toolbarSummary = hasActiveFilters
    ? [selectedCategoryLabel, selectedTags.length > 0 ? `标签 ${selectedTags.join('、')}` : '', searchTerm ? `搜索 ${searchTerm}` : '']
        .filter(Boolean)
        .join(' · ')
    : `已发布 ${workflows.length} 条流程`;
  const statCards = [
    { label: '已发布流程', value: String(workflows.length), detail: '启动大厅', icon: LayoutGrid, tone: 'blue' },
    { label: '当前符合', value: String(filteredWorkflows.length), detail: selectedCategoryLabel, icon: Search, tone: 'green' },
    { label: '流程分类', value: String(Math.max(categoryFilters.length - 1, 0)), detail: '业务域', icon: FileText, tone: 'amber' },
    { label: '标签', value: String(allTags.length), detail: selectedTags.length ? `已选 ${selectedTags.length}` : '全部标签', icon: Tags, tone: 'violet' },
  ];

  const handleStartClick = (workflow: WorkflowDefinition) => {
    setBoundFormError(null);
    setTargetWorkflow(workflow);
    setIsFormOpen(true);
  };

  const clearFilters = () => {
    setSearchTerm('');
    setSelectedCategory('');
    setSelectedTags([]);
  };

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag)
        ? prev.filter((item) => item !== tag)
        : [...prev, tag],
    );
  };

  const handleStartProcess = async (formData: Record<string, any>) => {
    if (!targetWorkflow || !user) return;

    try {
      await startProcess({
        processDefKey: targetWorkflow.key,
        businessKey: `BK_${Date.now()}`,
        title: `${targetWorkflow.name} - ${user.name}`,
        startUserId: user.id,
        startUserName: user.name,
        variables: { ...formData },
      });

      toast.success('流程发起成功');
      setIsFormOpen(false);
      setTargetWorkflow(null);
      navigate('/my-apps');
    } catch (error) {
      console.error('流程发起失败:', error);
      toast.error(getApiErrorMessage(error, '流程发起失败，请重试'));
    }
  };

  const renderResultContent = () => {
    if (loading) {
      return <PageLoading tip="流程列表加载中…" minHeight="min-h-[24rem]" />;
    }

    if (filteredWorkflows.length === 0) {
      return (
        <div className="p-6">
          <EmptyState
            title="没有匹配的流程"
            description="可以调整搜索词、分类或标签条件后重新查看。"
          />
        </div>
      );
    }

    return (
      <Table disableScrollWrapper className="min-w-[1020px]">
        <TableHeader>
          <TableRow>
            <TableHead>流程名称</TableHead>
            <TableHead>分类与标签</TableHead>
            <TableHead>流程标识</TableHead>
            <TableHead>绑定表单</TableHead>
            <TableActionHead>操作</TableActionHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filteredWorkflows.map((workflow) => {
            const workflowTags = normalizeWorkflowTags(workflow.tags);
            const categoryLabel =
              getWorkflowCategoryLabel(workflow.category) || workflow.category || '未分类';

            return (
              <TableRow key={workflow.id}>
                <TableCell className="min-w-[320px]">
                  <div className="truncate text-sm font-semibold text-slate-950 dark:text-slate-100">
                    {workflow.name}
                  </div>
                  <p className="mt-1 line-clamp-2 max-w-xl text-xs leading-5 text-slate-500 dark:text-slate-400">
                    {workflow.description || '暂无流程描述，点击发起进入表单填写。'}
                  </p>
                </TableCell>

                <TableCell className="min-w-[220px]">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="badge badge-primary">{categoryLabel}</span>
                    {workflowTags.slice(0, 2).map((tag) => (
                      <span
                        key={tag}
                        className="inline-flex items-center rounded-md border border-slate-200 bg-[var(--cf-surface-muted)] px-2 py-1 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
                      >
                        {tag}
                      </span>
                    ))}
                    {workflowTags.length > 2 ? (
                      <span className="text-xs text-slate-400">+{workflowTags.length - 2}</span>
                    ) : null}
                  </div>
                </TableCell>

                <TableCell className="whitespace-nowrap">
                  <div className="text-sm font-medium text-slate-800 dark:text-slate-100">
                    {workflow.key}
                  </div>
                  <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    v{workflow.version || 1}
                  </div>
                </TableCell>

                <TableCell className="whitespace-nowrap">
                  {workflow.formId ? (
                    <span className="inline-flex items-center rounded-md border border-emerald-100 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-600 dark:border-emerald-900/70 dark:bg-emerald-950/30 dark:text-emerald-200">
                      已绑定
                    </span>
                  ) : (
                    <span className="inline-flex items-center rounded-md border border-slate-200 bg-[var(--cf-surface-muted)] px-2.5 py-1 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
                      无表单
                    </span>
                  )}
                </TableCell>

                <TableCell>
                  <div className="flex justify-end">
                    <Button size="sm" className="gap-1.5" onClick={() => handleStartClick(workflow)}>
                      发起
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    );
  };

  const pageActions = (
    <div className="grid gap-5">
      <header className="admin-source-header">
        <div>
          <p className="admin-source-kicker">WORKPLACE</p>
          <h2>工作台</h2>
          <span>集成组织内已发布流程，按分类和标签快速发起业务流转</span>
          {invalidModelCount > 0 ? (
            <div className="admin-source-context-row" role="status">
              <div className="admin-source-context-chip">
                <span className="admin-source-context-icon is-warning">
                  <AlertTriangle size={16} />
                </span>
                <strong>模型校验</strong>
                <em>{invalidModelCount} 条异常</em>
                <small>已跳过</small>
              </div>
            </div>
          ) : null}
        </div>
        <div className="admin-source-controls">
          {hasActiveFilters ? (
            <Button
              variant="outline"
              size="sm"
              onClick={clearFilters}
            >
              重置过滤
            </Button>
          ) : null}
          <Button variant="outline" size="sm" onClick={() => navigate('/workflow/design')}>
            工作流设计中心
          </Button>
          <Button size="sm" onClick={() => navigate('/templates')}>
            浏览预设模板
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
    </div>
  );

  const pageFilters = (
      <section className="card admin-users-toolbar">
        <div className="admin-toolbar-filter-grid">
          <label className="min-w-0">
            <span className="input-label">流程搜索</span>
            <div className="admin-source-search-field">
              <Search size={16} />
              <Input
                className="h-[42px]"
                type="search"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="流程模型名称、Key、描述信息"
              />
            </div>
          </label>

          <label className="min-w-0">
            <span className="input-label">分类</span>
            <Select value={selectedCategory} onValueChange={setSelectedCategory}>
              <SelectTrigger>
                <SelectValue placeholder="全部流程" />
              </SelectTrigger>
              <SelectContent>
                {categoryFilters.map((option) => (
                  <SelectItem key={option.value || 'ALL'} value={option.value} label={option.label}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>

          <div className="admin-users-toolbar-actions">
            <span className="admin-users-filter-count">{toolbarSummary}</span>
            {hasActiveFilters ? (
              <Button variant="outline" size="sm" onClick={clearFilters}>
                重置过滤
              </Button>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-1 text-xs font-medium text-slate-500 dark:text-slate-400">常用标签</span>
          {allTags.length > 0 ? (
            allTags.map((tag) => (
              <FilterChip
                key={tag}
                active={selectedTags.includes(tag)}
                onClick={() => toggleTag(tag)}
              >
                {tag}
              </FilterChip>
            ))
          ) : (
            <span className="text-xs text-slate-400 dark:text-slate-500">暂无标签</span>
          )}
        </div>
      </section>
  );

  const pageContent = (
      <InnerTableSurface className="flex min-h-0 flex-1 flex-col" wrapperClassName="flex min-h-0 flex-1 flex-col p-0">
        <div className="admin-source-section-head border-b border-slate-200 px-4 py-3 dark:border-slate-800">
          <div>
            <div className="text-sm font-semibold text-slate-950 dark:text-slate-100">可发起流程</div>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {filteredWorkflows.length} 条 · 表格视图
            </p>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-auto">
          {renderResultContent()}
        </div>
      </InnerTableSurface>
  );

  return (
    <section className="admin-source-page">
      <WorkflowLaunchDialog
        open={isFormOpen}
        workflow={targetWorkflow}
        boundForm={boundForm}
        loadingBoundForm={loadingBoundForm}
        boundFormError={boundFormError}
        onClose={() => setIsFormOpen(false)}
        onSubmit={handleStartProcess}
      />

      <TablePageLayout
        actions={pageActions}
        filters={pageFilters}
        table={pageContent}
      />
    </section>
  );
};

export default Workplace;
