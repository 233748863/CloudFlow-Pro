import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import type { FormDefinition, WorkflowDefinition } from '@/types';
import { Role } from '@/types';
import { useAuth } from '@/context/AuthContext';
import {
  WorkflowCatalogFilters,
  WorkflowCatalogGrid,
  WorkflowCatalogStats,
  WorkflowLaunchDialog,
  mapWorkflowBackendForm,
  normalizeWorkflowTags,
} from '@/components/workflow/catalog';
import {
  getFormDefinition,
  getProcessDefinitions,
  getFormDefinitions,
  startProcess,
} from '@/services/api/workflow';
import { parseWorkflowGraphDefinition } from '@/utils/workflowGraph';
import {
  WORKFLOW_CATEGORY_OPTIONS,
  normalizeWorkflowCategory,
} from '@/utils/workflowCategory';

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
            ? response.filter(
                (item: any) => String(item?.status || '').toUpperCase() === 'PUBLISHED',
              )
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
            .filter(
              (item: any) => typeof item?.processKey === 'string' && item.processKey.trim() !== '',
            )
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

  const filteredWorkflows = useMemo(() => {
    return workflows.filter((workflow) => {
      const matchesSearch = workflow.name.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesCategory = !selectedCategory || workflow.category === selectedCategory;
      const workflowTags = normalizeWorkflowTags(workflow.tags);
      const matchesTags =
        selectedTags.length === 0 || selectedTags.some((tag) => workflowTags.includes(tag));

      return matchesSearch && matchesCategory && matchesTags;
    });
  }, [searchTerm, selectedCategory, selectedTags, workflows]);

  const allTags = useMemo(
    () => Array.from(new Set(workflows.flatMap((workflow) => normalizeWorkflowTags(workflow.tags)))),
    [workflows],
  );

  const categoryFilters = useMemo(
    () => [{ label: '全部', value: '' }, ...WORKFLOW_CATEGORY_OPTIONS],
    [],
  );

  const boundForm = targetWorkflow?.formId
    ? savedForms.find((form) => form.id === targetWorkflow.formId)
    : undefined;

  const hasActiveFilters = Boolean(searchTerm || selectedCategory || selectedTags.length > 0);
  const boundFormCount = workflows.filter((workflow) => Boolean(workflow.formId)).length;
  const categoryCount = new Set(workflows.map((workflow) => workflow.category).filter(Boolean)).size;

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

  return (
    <div className="space-y-6">
      <WorkflowLaunchDialog
        open={isFormOpen}
        workflow={targetWorkflow}
        boundForm={boundForm}
        loadingBoundForm={loadingBoundForm}
        boundFormError={boundFormError}
        onClose={() => setIsFormOpen(false)}
        onSubmit={handleStartProcess}
      />

      <WorkflowCatalogStats
        workflowCount={workflows.length}
        filteredCount={filteredWorkflows.length}
        boundFormCount={boundFormCount}
        categoryCount={categoryCount}
        hasActiveFilters={hasActiveFilters}
      />

      <WorkflowCatalogFilters
        searchTerm={searchTerm}
        selectedCategory={selectedCategory}
        selectedTags={selectedTags}
        allTags={allTags}
        categoryOptions={categoryFilters}
        savedFormsCount={savedForms.length}
        hasActiveFilters={hasActiveFilters}
        onSearchChange={setSearchTerm}
        onCategoryChange={setSelectedCategory}
        onTagToggle={(tag) => {
          setSelectedTags((prev) =>
            prev.includes(tag) ? prev.filter((item) => item !== tag) : [...prev, tag],
          );
        }}
        onClearFilters={() => {
          setSearchTerm('');
          setSelectedCategory('');
          setSelectedTags([]);
        }}
      />

      <WorkflowCatalogGrid
        workflows={filteredWorkflows}
        loading={loading}
        onStart={handleStartClick}
      />
    </div>
  );
};

export default Workplace;
