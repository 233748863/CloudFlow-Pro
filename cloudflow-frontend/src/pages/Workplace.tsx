import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  Clock,
  DollarSign,
  FileBadge,
  Filter,
  FolderOpen,
  FormInput,
  GitMerge,
  Monitor,
  PlayCircle,
  Search,
  Sparkles,
  Tag,
  X,
  AlertTriangle,
} from 'lucide-react';
import { Button, Card, Input } from '@/components/ui';
import { WorkflowDefinition, FormDefinition, Role } from '../types';
import {
  getProcessDefinitions,
  getFormDefinition,
  getFormDefinitions,
  startProcess,
} from '../services/api/workflow';
import { FormRenderer } from '../components/FormRenderer';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { parseWorkflowGraphDefinition } from '../utils/workflowGraph';
import {
  WORKFLOW_CATEGORY_OPTIONS,
  getWorkflowCategoryLabel,
  normalizeWorkflowCategory,
} from '../utils/workflowCategory';
import {
  WorkspaceBackdrop,
  WorkspaceInlineState,
} from '@/components/workspace/WorkspacePrimitives';
import {
  WorkspaceDialogShell,
  WorkspaceHeroCard,
  WorkspaceMetricCard,
  WorkspaceResultCard,
  WorkspaceWorkbenchCard,
} from '@/components/workspace/WorkspacePanels';

const normalizeTags = (rawTags: unknown): string[] => {
  if (Array.isArray(rawTags)) {
    return rawTags.filter((item): item is string => typeof item === 'string');
  }

  if (typeof rawTags !== 'string' || rawTags.trim() === '') {
    return [];
  }

  try {
    const parsed = JSON.parse(rawTags);
    if (Array.isArray(parsed)) {
      return parsed.filter((item): item is string => typeof item === 'string');
    }
  } catch {
    // 兼容后端以逗号拼接标签的旧数据。
  }

  return rawTags
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
};

const mapBackendForm = (form: any): FormDefinition => {
  let fields: any[] = [];
  const raw =
    typeof form?.fieldsJson === 'string'
      ? form.fieldsJson
      : typeof form?.formSchema === 'string'
        ? form.formSchema
        : null;

  if (raw) {
    try {
      fields = JSON.parse(raw);
    } catch {
      try {
        const sanitized = raw.replace(/\\([^"\\/bfnrtu])/g, '\\\\$1');
        fields = JSON.parse(sanitized);
      } catch {
        fields = [];
      }
    }
  }

  return {
    id: String(form?.formId || ''),
    name: form?.formName || '未命名表单',
    fields,
  };
};

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

const formatDateCN = (date: Date): string => {
  const weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
  return `${date.getMonth() + 1}月${date.getDate()}日 ${weekdays[date.getDay()]}`;
};

const getWorkflowIcon = (workflow: WorkflowDefinition) => {
  if (workflow.key.includes('reimburse') || workflow.key.includes('payment')) {
    return <DollarSign size={22} />;
  }
  if (workflow.key.includes('leave') || workflow.key.includes('overtime')) {
    return <Clock size={22} />;
  }
  if (workflow.key.includes('it') || workflow.key.includes('deploy')) {
    return <Monitor size={22} />;
  }
  if (workflow.key.includes('contract') || workflow.key.includes('file')) {
    return <FileBadge size={22} />;
  }
  return <GitMerge size={22} />;
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
            .filter((item: any) => typeof item?.definitionId === 'string' && item.definitionId.trim() !== '')
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
                  tags: typeof item.tags === 'string' ? item.tags : JSON.stringify(normalizeTags(item.tags)),
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
            toast.warning(`有 ${invalidModelCount} 条流程模型异常，已跳过加载`);
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
          setSavedForms(response.map((item: any) => mapBackendForm(item)));
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
        const mapped = mapBackendForm(response);
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

  const filteredWorkflows = useMemo(() => {
    return workflows.filter((workflow) => {
      const matchesSearch = workflow.name.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesCategory = !selectedCategory || workflow.category === selectedCategory;
      const workflowTags = normalizeTags(workflow.tags);
      const matchesTags =
        selectedTags.length === 0 ||
        selectedTags.some((tag) => workflowTags.includes(tag));

      return matchesSearch && matchesCategory && matchesTags;
    });
  }, [searchTerm, selectedCategory, selectedTags, workflows]);

  const allTags = useMemo(
    () => Array.from(new Set(workflows.flatMap((workflow) => normalizeTags(workflow.tags)))),
    [workflows],
  );

  const categoryFilters = useMemo(
    () => [{ label: '全部', value: '' }, ...WORKFLOW_CATEGORY_OPTIONS],
    [],
  );

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

  const boundForm = targetWorkflow?.formId
    ? savedForms.find((form) => form.id === targetWorkflow.formId)
    : undefined;

  const todayLabel = formatDateCN(new Date());
  const timeLabel = new Date().toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  });
  const hasActiveFilters = Boolean(searchTerm || selectedCategory || selectedTags.length > 0);
  const boundFormCount = workflows.filter((workflow) => Boolean(workflow.formId)).length;
  const categoryCount = new Set(workflows.map((workflow) => workflow.category).filter(Boolean)).size;

  const overviewItems = [
    { label: '当前结果', value: `${filteredWorkflows.length} 条` },
    { label: '分类', value: selectedCategory ? getWorkflowCategoryLabel(selectedCategory) || selectedCategory : '全部分类' },
    { label: '标签', value: selectedTags.length > 0 ? `${selectedTags.length} 个已选` : '全部标签' },
    { label: '视图', value: hasActiveFilters ? '筛选结果' : '默认视图' },
  ];

  return (
    <div className="relative min-h-screen pb-6">
      <WorkspaceBackdrop />

      <div className="relative z-10 space-y-3">
        {isFormOpen && targetWorkflow ? (
          targetWorkflow.formId ? (
            loadingBoundForm ? (
              <WorkspaceDialogShell
                title="正在准备发起表单"
                description={`正在加载“${targetWorkflow.name}”绑定的表单定义。`}
                onClose={() => setIsFormOpen(false)}
                maxWidthClassName="max-w-2xl"
              >
                <WorkspaceInlineState
                  type="loading"
                  title="正在加载表单"
                  description="请稍候，系统正在获取流程绑定的表单定义。"
                  className="py-16"
                />
              </WorkspaceDialogShell>
            ) : boundForm ? (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4 backdrop-blur-md">
                <FormRenderer
                  formDef={boundForm}
                  onCancel={() => setIsFormOpen(false)}
                  onSubmit={handleStartProcess}
                />
              </div>
            ) : (
              <WorkspaceDialogShell
                title="绑定表单不可用"
                description={`流程“${targetWorkflow.name}”当前无法加载绑定表单。`}
                onClose={() => setIsFormOpen(false)}
                maxWidthClassName="max-w-2xl"
              >
                <WorkspaceInlineState
                  type="info"
                  icon={<AlertTriangle size={18} className="text-amber-500" />}
                  title="绑定表单不存在"
                  description={
                    boundFormError
                      ? `无法加载绑定表单：${boundFormError}`
                      : '流程绑定的表单可能已被删除或当前账号无权访问，请联系管理员检查流程配置。'
                  }
                  className="py-14"
                />
              </WorkspaceDialogShell>
            )
          ) : (
            <WorkspaceDialogShell
              title="暂未配置输入表单"
              description={`流程“${targetWorkflow.name}”还没有绑定可发起表单。`}
              onClose={() => setIsFormOpen(false)}
              maxWidthClassName="max-w-2xl"
            >
              <WorkspaceInlineState
                type="info"
                icon={<AlertTriangle size={18} className="text-amber-500" />}
                title="未绑定表单"
                description="该流程尚未配置输入表单，暂时无法自动发起。"
                className="py-14"
              />
            </WorkspaceDialogShell>
          )
        ) : null}

        <WorkspaceHeroCard
          badge={(
            <div className="flex flex-wrap items-center gap-2 text-[11px] font-medium text-slate-500">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-pink-50 px-2.5 py-1 text-pink-600 ring-1 ring-pink-100">
                <Sparkles size={14} />
                {todayLabel}
              </span>
              <span className="rounded-full bg-white/80 px-2.5 py-1 ring-1 ring-slate-200/80">{timeLabel}</span>
            </div>
          )}
          title="发起业务流程"
          description="以 business-trip 页面的视觉层级重构发起入口，把搜索、分类、标签和流程卡片统一收口到同一套工作台体验。"
          actions={(
            <Button variant="outline" onClick={() => navigate('/my-apps')}>
              <PlayCircle size={15} />
              查看我的申请
            </Button>
          )}
          contentClassName="p-4 sm:p-5"
          glowClassName="bg-[radial-gradient(circle_at_top_right,rgba(244,114,182,0.14),transparent_55%),radial-gradient(circle_at_top_left,rgba(251,191,36,0.12),transparent_46%)]"
        >
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <WorkspaceMetricCard
              label="已发布流程"
              value={workflows.length}
              hint="按流程 key 自动保留最新发布版本"
              aside={<GitMerge size={18} className="text-pink-500" />}
            />
            <WorkspaceMetricCard
              label="当前筛选"
              value={filteredWorkflows.length}
              hint={hasActiveFilters ? '已应用搜索、分类或标签过滤' : '默认视图下展示全部可发起流程'}
              aside={<Filter size={18} className="text-amber-500" />}
            />
            <WorkspaceMetricCard
              label="已绑表单"
              value={boundFormCount}
              hint="可直接拉起表单并进入流程"
              aside={<FormInput size={18} className="text-emerald-500" />}
            />
            <WorkspaceMetricCard
              label="流程分类"
              value={categoryCount}
              hint="用于建立更清晰的业务入口分组"
              aside={<FolderOpen size={18} className="text-sky-500" />}
            />
          </div>
        </WorkspaceHeroCard>

        <Card className="rounded-[28px] border-white/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.8),rgba(248,250,252,0.72))] p-3.5 shadow-[0_18px_44px_rgba(15,23,42,0.05)] backdrop-blur-xl">
          <div className="flex flex-col gap-3">
            <WorkspaceWorkbenchCard
              title="流程筛选"
              total={filteredWorkflows.length}
              hasActiveFilters={hasActiveFilters}
              overviewItems={overviewItems}
              quickFilters={categoryFilters}
              activeQuickFilter={selectedCategory}
              onQuickFilterChange={setSelectedCategory}
              headerBadges={(
                <div className="flex flex-wrap gap-2">
                  <span className="rounded-full bg-white/82 px-3 py-1.5 text-[11px] font-medium text-slate-500 ring-1 ring-white/80 shadow-[0_8px_18px_rgba(15,23,42,0.04)]">
                    标签池 {allTags.length} 个
                  </span>
                  <span className="rounded-full bg-white/82 px-3 py-1.5 text-[11px] font-medium text-slate-500 ring-1 ring-white/80 shadow-[0_8px_18px_rgba(15,23,42,0.04)]">
                    已缓存表单 {savedForms.length} 个
                  </span>
                </div>
              )}
              quickFilterAside={hasActiveFilters ? (
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
              ) : (
                <span className="rounded-full bg-white/82 px-3 py-1.5 text-[11px] font-medium text-slate-400 ring-1 ring-white/80 shadow-[0_8px_18px_rgba(15,23,42,0.04)]">
                  当前未应用额外筛选
                </span>
              )}
              filterBar={(
                <div className="space-y-3">
                  <div className="grid grid-cols-1 gap-2.5 xl:grid-cols-[minmax(0,1fr)_auto]">
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                      <Input
                        className="pl-9"
                        value={searchTerm}
                        onChange={(event) => setSearchTerm(event.target.value)}
                        placeholder="按流程名称搜索"
                      />
                    </div>
                    <Button variant="outline" type="button" disabled className="cursor-default">
                      <Search size={15} />
                      已实时筛选
                    </Button>
                  </div>

                  {allTags.length > 0 ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-white/82 px-3 py-1.5 text-[11px] font-medium text-slate-500 ring-1 ring-white/80 shadow-[0_8px_18px_rgba(15,23,42,0.04)]">
                        <Tag size={12} />
                        标签筛选
                      </span>
                      {allTags.map((tag) => {
                        const active = selectedTags.includes(tag);
                        return (
                          <button
                            key={tag}
                            type="button"
                            onClick={() => {
                              setSelectedTags((prev) =>
                                prev.includes(tag)
                                  ? prev.filter((item) => item !== tag)
                                  : [...prev, tag],
                              );
                            }}
                            className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                              active
                                ? 'bg-[linear-gradient(135deg,#f472b6,#ec4899)] text-white shadow-[0_10px_20px_rgba(236,72,153,0.2)]'
                                : 'border border-white/80 bg-white/80 text-slate-600 hover:bg-white hover:text-pink-600'
                            }`}
                          >
                            {tag}
                          </button>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              )}
            />

            <WorkspaceResultCard
              total={filteredWorkflows.length}
              title="可发起流程"
              description="卡片式呈现每个流程的分类、表单绑定、标签和入口动作，让发起页的视觉语言与业务申请页保持一致。"
            >
              {loading ? (
                <div className="p-6">
                  <WorkspaceInlineState type="loading" title="正在加载流程定义..." className="py-14" />
                </div>
              ) : filteredWorkflows.length > 0 ? (
                <div className="grid gap-4 p-4 md:grid-cols-2 xl:grid-cols-3">
                  {filteredWorkflows.map((workflow) => {
                    const workflowTags = normalizeTags(workflow.tags);
                    const categoryLabel = getWorkflowCategoryLabel(workflow.category) || workflow.category || '未分类';

                    return (
                      <button
                        key={workflow.id}
                        type="button"
                        onClick={() => handleStartClick(workflow)}
                        className="group text-left"
                      >
                        <div className="relative overflow-hidden rounded-[28px] border border-white/78 bg-[linear-gradient(180deg,rgba(255,255,255,0.88),rgba(248,250,252,0.78))] p-5 shadow-[0_16px_34px_rgba(15,23,42,0.05),inset_0_1px_0_rgba(255,255,255,0.74)] transition-all duration-200 hover:-translate-y-1 hover:shadow-[0_22px_42px_rgba(15,23,42,0.08),inset_0_1px_0_rgba(255,255,255,0.78)]">
                          <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-[radial-gradient(circle_at_top_right,rgba(244,114,182,0.12),transparent_58%),radial-gradient(circle_at_top_left,rgba(251,191,36,0.08),transparent_48%)]" />
                          <div className="relative">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="rounded-full bg-pink-50 px-2.5 py-1 text-[11px] font-medium text-pink-600 ring-1 ring-pink-100">
                                {categoryLabel}
                              </span>
                              <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ring-1 ${
                                workflow.formId
                                  ? 'bg-emerald-50 text-emerald-600 ring-emerald-100'
                                  : 'bg-amber-50 text-amber-700 ring-amber-100'
                              }`}>
                                {workflow.formId ? '已绑表单' : '未绑表单'}
                              </span>
                            </div>

                            <div className="mt-4 flex items-start justify-between gap-4">
                              <div className="flex h-12 w-12 items-center justify-center rounded-[18px] bg-pink-50 text-pink-600 ring-1 ring-pink-100 shadow-[0_8px_18px_rgba(15,23,42,0.04)]">
                                {getWorkflowIcon(workflow)}
                              </div>
                              <span className="text-xs font-medium text-slate-400">v{workflow.version || 1}</span>
                            </div>

                            <div className="mt-4 text-lg font-semibold tracking-tight text-slate-900 group-hover:text-pink-600">
                              {workflow.name}
                            </div>
                            <div className="mt-2 line-clamp-2 min-h-[42px] text-sm leading-6 text-slate-500">
                              {workflow.description || '当前流程暂未补充说明，可直接发起或联系管理员完善流程描述。'}
                            </div>

                            <div className="mt-4 flex flex-wrap gap-1.5">
                              {workflowTags.length > 0 ? workflowTags.slice(0, 3).map((tag) => (
                                <span key={tag} className="rounded-full bg-white/82 px-2.5 py-1 text-[11px] font-medium text-slate-500 ring-1 ring-white/80">
                                  {tag}
                                </span>
                              )) : (
                                <span className="rounded-full bg-white/82 px-2.5 py-1 text-[11px] font-medium text-slate-400 ring-1 ring-white/80">
                                  暂无标签
                                </span>
                              )}
                            </div>

                            <div className="mt-5 flex items-center justify-between gap-3 border-t border-white/70 pt-4">
                              <div className="min-w-0">
                                <div className="truncate text-xs font-medium text-slate-400">Key: {workflow.key}</div>
                                <div className="mt-1 text-xs text-slate-500">
                                  {workflow.formId ? '支持直接发起表单' : '暂未配置发起表单'}
                                </div>
                              </div>
                              <div className="inline-flex items-center gap-1 rounded-full bg-pink-50 px-3 py-1.5 text-xs font-medium text-pink-600 ring-1 ring-pink-100">
                                发起
                                <ArrowRight size={14} />
                              </div>
                            </div>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="p-6">
                  <WorkspaceInlineState
                    title="没有匹配的流程"
                    description="可以调整搜索词、分类或标签条件，重新查看可发起流程。"
                    className="py-14"
                  />
                </div>
              )}
            </WorkspaceResultCard>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default Workplace;
