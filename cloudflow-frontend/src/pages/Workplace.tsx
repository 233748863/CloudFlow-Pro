import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Search } from 'lucide-react';
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
import { TablePageLayout, TableSurfaceCard } from '@/components/layout/TablePageLayout';
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
import { Button, EmptyState, FilterChip, Input, PageLoading, SideNavItem } from '@/components/common';
import { cn } from '@/utils/cn';

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

          let invalidModelCount = 0;
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
                invalidModelCount += 1;
                console.warn(`[Workplace] 跳过模型异常流程: ${workflowName}`, error);
                return null;
              }
            })
            .filter((item): item is WorkflowDefinition => item !== null);

          setWorkflows(mapped);
          if (invalidModelCount > 0) {
            toast.warning(`有 ${invalidModelCount} 条流程模型异常，已自动跳过`);
          }
        } else {
          setWorkflows([]);
        }
      } catch (error) {
        console.error('加载流程列表失败:', error);
        toast.error('加载流程列表失败，请稍后重试');
        setWorkflows([]);
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

  const handleStartClick = (workflow: WorkflowDefinition) => {
    setBoundFormError(null);
    setTargetWorkflow(workflow);
    setIsFormOpen(true);
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
      <div className="divide-y divide-slate-100 dark:divide-slate-800">
        {filteredWorkflows.map((workflow) => {
          const workflowTags = normalizeWorkflowTags(workflow.tags);
          const categoryLabel =
            getWorkflowCategoryLabel(workflow.category) || workflow.category || '未分类';

          return (
            <div
              key={workflow.id}
              className="flex flex-col gap-4 px-4 py-4 transition-colors hover:bg-slate-50 dark:hover:bg-slate-900/40 lg:flex-row lg:items-center lg:justify-between"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {workflow.name}
                  </h3>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">
                    {categoryLabel}
                  </span>
                  <span className="text-[11px] text-slate-400 dark:text-slate-500">
                    v{workflow.version || 1}
                  </span>
                </div>

                {workflow.description ? (
                  <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
                    {workflow.description}
                  </p>
                ) : null}

                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                  <span>Key {workflow.key}</span>
                  <span>{workflow.formId ? '已绑表单' : '未绑表单'}</span>
                  <span>{workflowTags.length > 0 ? workflowTags.slice(0, 3).join(' · ') : '暂无标签'}</span>
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <Button size="sm" onClick={() => handleStartClick(workflow)}>
                  发起
                  <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="space-y-4">
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
        className="gap-4"
        filters={(
          <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-slate-800 dark:bg-slate-950/88 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-1 flex-wrap items-center gap-3">
              <div className="relative min-w-[220px] flex-1 lg:max-w-sm">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="按流程名称搜索"
                  className="pl-10"
                />
              </div>

              <div className="flex min-w-[280px] flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                <span>{toolbarSummary}</span>
                <span>当前 {filteredWorkflows.length} 条</span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 lg:justify-end">
              {hasActiveFilters ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSearchTerm('');
                    setSelectedCategory('');
                    setSelectedTags([]);
                  }}
                >
                  清空筛选
                </Button>
              ) : null}
              <Button variant="outline" size="sm" onClick={() => navigate('/workflow/design')}>
                进入设计页
              </Button>
              <Button size="sm" onClick={() => navigate('/templates')}>
                浏览模板
              </Button>
            </div>
          </div>
        )}
        table={(<TableSurfaceCard>
          <div className="grid min-h-[40rem] xl:grid-cols-[220px_minmax(0,1fr)]">
            <aside className="border-b border-slate-200 bg-slate-50/40 dark:border-slate-800 dark:bg-slate-950/20 xl:border-b-0 xl:border-r">
              <div className="space-y-5 p-4">
                <section className="space-y-2">
                  <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">
                    分类
                  </div>
                  <div className="space-y-1">
                    {categoryFilters.map((option) => {
                      const active = selectedCategory === option.value;
                      return (
                        <SideNavItem
                          key={option.value || 'ALL'}
                          size="sm"
                          active={active}
                          onClick={() => setSelectedCategory(option.value)}
                        >
                          <span className="truncate">{option.label}</span>
                        </SideNavItem>
                      );
                    })}
                  </div>
                </section>

                <section className="space-y-2">
                  <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">
                    标签
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {allTags.map((tag) => {
                      const active = selectedTags.includes(tag);
                      return (
                        <FilterChip
                          key={tag}
                          active={active}
                          onClick={() =>
                            setSelectedTags((prev) =>
                              prev.includes(tag)
                                ? prev.filter((item) => item !== tag)
                                : [...prev, tag],
                            )
                          }
                        >
                          {tag}
                        </FilterChip>
                      );
                    })}
                  </div>
                </section>
              </div>
            </aside>

            <section className="flex min-h-0 flex-col">
              <div className="flex-1 overflow-y-auto">
                {renderResultContent()}
              </div>
            </section>
          </div>
        </TableSurfaceCard>)}
      />
    </div>
  );
};

export default Workplace;
