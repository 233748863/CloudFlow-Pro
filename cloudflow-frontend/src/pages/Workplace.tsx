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
      <div className="stagger-container grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5 p-6">
        {filteredWorkflows.map((workflow, index) => {
          const workflowTags = normalizeWorkflowTags(workflow.tags);
          const categoryLabel =
            getWorkflowCategoryLabel(workflow.category) || workflow.category || '未分类';
          const staggerClass = `stagger-item-${Math.min(index + 1, 10)}`;

          return (
            <div
              key={workflow.id}
              className={cn(
                "group relative flex flex-col justify-between rounded-2xl border border-slate-100/60 bg-white/40 p-5 shadow-[0_2px_12px_-3px_rgba(15,23,42,0.01)] transition-all duration-300 hover:-translate-y-1 hover:bg-white/80 hover:shadow-[0_12px_24px_rgba(15,23,42,0.04)] dark:border-slate-800/30 dark:bg-slate-950/20 dark:hover:bg-slate-950/50",
                staggerClass
              )}
            >
              <div>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-600 dark:bg-teal-950/20 dark:text-teal-400 font-bold shadow-[0_2px_8px_rgba(20,184,166,0.08)]">
                    {workflow.name[0]?.toUpperCase() || 'W'}
                  </div>
                  <div className="flex flex-wrap justify-end gap-1 scale-90 origin-right">
                    <span className="badge badge-primary">{categoryLabel}</span>
                    <span className="badge badge-gray">v{workflow.version || 1}</span>
                  </div>
                </div>

                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mt-4 group-hover:text-teal-600 dark:group-hover:text-teal-400 transition-colors">
                  {workflow.name}
                </h3>

                <p className="mt-2 text-xs leading-relaxed text-slate-500 dark:text-slate-400 line-clamp-2 min-h-[2rem]">
                  {workflow.description || '暂无流程描述，点击下方按钮发起流转。'}
                </p>
              </div>

              <div className="mt-4 border-t border-slate-100/60 dark:border-slate-800/40 pt-3 flex items-center justify-between gap-2">
                <div className="flex flex-wrap gap-1 max-w-[60%]">
                  {workflowTags.length > 0 ? (
                    workflowTags.slice(0, 2).map((tag) => (
                      <span key={tag} className="text-[10px] font-medium bg-slate-100/80 text-slate-500 px-1.5 py-0.5 rounded dark:bg-slate-800/60 dark:text-slate-400">
                        #{tag}
                      </span>
                    ))
                  ) : (
                    <span className="text-[10px] text-slate-400 dark:text-slate-500">
                      #通用
                    </span>
                  )}
                </div>
                <Button size="sm" className="btn-primary py-1 px-3.5 text-xs rounded-xl shadow-sm" onClick={() => handleStartClick(workflow)}>
                  发起
                  <ArrowRight className="ml-1 h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
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
        className="gap-5"
        filters={(
          <div className="flex flex-col gap-5 rounded-2xl border border-slate-200/40 bg-white/40 p-6 shadow-[0_4px_20px_-4px_rgba(15,23,42,0.01)] dark:border-slate-800/30 dark:bg-slate-950/20 backdrop-blur-md">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold text-slate-900 dark:text-slate-50 tracking-tight">流程启动大厅</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">集成了组织内所有已发布的标准化业务流程，随时一键发起流转。</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {hasActiveFilters ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-xl border-slate-200/60 shadow-sm"
                    onClick={() => {
                      setSearchTerm('');
                      setSelectedCategory('');
                      setSelectedTags([]);
                    }}
                  >
                    重置过滤
                  </Button>
                ) : null}
                <Button variant="outline" size="sm" className="rounded-xl border-slate-200/60 shadow-sm" onClick={() => navigate('/workflow/design')}>
                  工作流设计中心
                </Button>
                <Button size="sm" className="btn-primary rounded-xl" onClick={() => navigate('/templates')}>
                  浏览预设模板
                </Button>
              </div>
            </div>

            <div className="h-px bg-slate-200/30 dark:bg-slate-800/30" />

            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div className="relative min-w-[260px] flex-1 max-w-md">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="搜索流程模型名称、Key、描述信息..."
                  className="pl-10 h-10 rounded-xl bg-white/60 dark:bg-slate-950/30 border-slate-200/60 dark:border-slate-800/60"
                />
              </div>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                <span className="font-semibold text-teal-600 dark:text-teal-400 bg-teal-500/10 px-2.5 py-1 rounded-lg">{toolbarSummary}</span>
                <span className="text-slate-400 dark:text-slate-500">当前符合：{filteredWorkflows.length} 个项目</span>
              </div>
            </div>
          </div>
        )}
        table={(<TableSurfaceCard className="border-slate-200/40 dark:border-slate-800/30 bg-white/40 backdrop-blur-md">
          <div className="grid min-h-[40rem] xl:grid-cols-[220px_minmax(0,1fr)]">
            <aside className="border-b border-slate-200/40 bg-slate-50/30 dark:border-slate-800/20 dark:bg-slate-950/10 xl:border-b-0 xl:border-r border-slate-200/40 dark:border-slate-800/30">
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
