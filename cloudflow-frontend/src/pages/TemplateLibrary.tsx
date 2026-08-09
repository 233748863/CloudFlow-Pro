import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Filter, FolderTree, Library, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { useWorkflowPermission } from "@/hooks/useWorkflowPermission";
import request from "@/services/api/request";
import { DEFAULT_COMMON_TAGS, TEXT } from "./template-library/config";
import { TemplateLibraryCreateDialog } from "./template-library/TemplateLibraryCreateDialog";
import { TemplateLibraryPreviewDialog } from "./template-library/TemplateLibraryPreviewDialog";
import { TemplateLibraryResults } from "./template-library/TemplateLibraryResults";
import { TemplateLibraryToolbar } from "./template-library/TemplateLibraryToolbar";
import type {
  CategoryNode,
  CreateWorkflowResponse,
  TemplateItem,
  TemplateListResult,
} from "./template-library/types";
import {
  EMPTY_GRAPH,
  findCategoryName,
  formatNodeType,
  normalizeTags,
  parseTemplateDefinition,
} from "./template-library/utils";
import { TablePageLayout } from "@/components/layout/TablePageLayout";
import '../styles/features/template-market.css';

export const TemplateLibrary: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const { canManageTemplates } = useWorkflowPermission();
  const entrySource = (searchParams.get("entry") || "").trim().toLowerCase();
  const fromCreateFlow = entrySource === "create";

  const [templates, setTemplates] = useState<TemplateItem[]>([]);
  const [categories, setCategories] = useState<CategoryNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [recommendedTags, setRecommendedTags] =
    useState<string[]>(DEFAULT_COMMON_TAGS);
  const [currentPage, setCurrentPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [showPreview, setShowPreview] = useState(false);
  const [previewTemplate, setPreviewTemplate] = useState<TemplateItem | null>(
    null,
  );
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createTemplateId, setCreateTemplateId] = useState("");
  const [workflowName, setWorkflowName] = useState("");
  const [workflowDescription, setWorkflowDescription] = useState("");

  const pageSize = 12;

  const previewGraph = useMemo(
    () =>
      previewTemplate
        ? parseTemplateDefinition(previewTemplate.definition)
        : EMPTY_GRAPH,
    [previewTemplate],
  );
  const previewTags = useMemo(
    () => normalizeTags(previewTemplate?.tags),
    [previewTemplate],
  );
  const previewOverviewStats = useMemo(
    () => [
      { label: TEXT.nodeCount, value: String(previewGraph.nodes.length) },
      { label: TEXT.edgeCount, value: String(previewGraph.edges.length) },
      {
        label: TEXT.category,
        value: previewTemplate?.categoryName || TEXT.uncategorized,
      },
      {
        label: TEXT.templateUsage,
        value: String(previewTemplate?.usageCount || 0),
      },
    ],
    [previewGraph, previewTemplate],
  );
  const previewNodeTypes = useMemo(
    () =>
      Array.from(
        new Set(previewGraph.nodes.map((node) => formatNodeType(node.type))),
      ).slice(0, 8),
    [previewGraph],
  );
  const templateInsights = useMemo(
    () =>
      new Map(
        templates.map((template) => [
          template.id,
          parseTemplateDefinition(template.definition),
        ]),
      ),
    [templates],
  );

  const selectedCategoryName = useMemo(() => {
    if (!selectedCategory) {
      return TEXT.allTemplates;
    }

    return findCategoryName(categories, selectedCategory) || TEXT.allTemplates;
  }, [categories, selectedCategory]);

  const hasActiveFilters =
    Boolean(searchTerm.trim()) ||
    Boolean(selectedCategory) ||
    selectedTags.length > 0;
  const activeFilterCount =
    Number(Boolean(searchTerm.trim())) +
    Number(Boolean(selectedCategory)) +
    selectedTags.length;
  const systemTemplateCount = templates.filter((template) => template.isSystem).length;

  const loadCategories = useCallback(async () => {
    try {
      const data = await request.get<CategoryNode[]>(
        "/workflow/templates/categories",
      );
      setCategories(data || []);
    } catch (error) {
      console.error(TEXT.loadCategoriesFailed, error);
      toast.error(TEXT.loadCategoriesFailed);
    }
  }, []);

  const loadTemplates = useCallback(async () => {
    setLoading(true);
    setLoadError("");

    try {
      const params: Record<string, string | number> = {
        pageNum: currentPage,
        pageSize,
      };

      if (selectedCategory) {
        params.categoryId = selectedCategory;
      }

      if (selectedTags.length > 0) {
        params.tags = selectedTags.join(",");
      }

      if (searchTerm.trim()) {
        params.keyword = searchTerm.trim();
      }

      const data = await request.get<TemplateListResult>("/workflow/templates", {
        params,
      });

      setTemplates(data?.records || []);
      setTotal(data?.total || 0);
    } catch (error) {
      console.error(TEXT.loadTemplatesFailed, error);
      setLoadError(TEXT.loadTemplatesFailed);
      toast.error(TEXT.loadTemplatesFailed);
    } finally {
      setLoading(false);
    }
  }, [currentPage, pageSize, searchTerm, selectedCategory, selectedTags]);

  const loadRecommendedTags = useCallback(async () => {
    try {
      const data = await request.get<string[]>("/workflow/templates/tags", {
        params: { limit: 12 },
      });
      if (Array.isArray(data) && data.length > 0) {
        setRecommendedTags(data);
        return;
      }
    } catch (error) {
      console.error(TEXT.loadTagsFailed, error);
    }

    setRecommendedTags(DEFAULT_COMMON_TAGS);
  }, []);

  useEffect(() => {
    void loadCategories();
  }, [loadCategories]);

  useEffect(() => {
    void loadRecommendedTags();
  }, [loadRecommendedTags]);

  useEffect(() => {
    void loadTemplates();
  }, [loadTemplates]);

  const handleCategoryChange = (categoryId: string) => {
    setSelectedCategory(categoryId);
    setCurrentPage(1);
  };

  const handleSearchChange = (value: string) => {
    setSearchTerm(value);
    setCurrentPage(1);
  };

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((item) => item !== tag) : [...prev, tag],
    );
    setCurrentPage(1);
  };

  const clearFilters = () => {
    setSearchTerm("");
    setSelectedCategory("");
    setSelectedTags([]);
    setCurrentPage(1);
  };

  const handlePreview = (template: TemplateItem) => {
    setPreviewTemplate(template);
    setShowPreview(true);
  };

  const handlePreviewOpenChange = (open: boolean) => {
    setShowPreview(open);
    if (!open) {
      setPreviewTemplate(null);
    }
  };

  const handleCreateFromTemplate = (templateId: string) => {
    if (!user) {
      toast.error(TEXT.loginRequired);
      return;
    }

    setCreateTemplateId(templateId);
    setWorkflowName("");
    setWorkflowDescription("");
    setShowCreateModal(true);
  };

  const handleCreateModalOpenChange = (open: boolean) => {
    setShowCreateModal(open);
    if (!open) {
      setCreateTemplateId("");
      setWorkflowName("");
      setWorkflowDescription("");
    }
  };

  const submitCreateWorkflow = async () => {
    const trimmedName = workflowName.trim();
    if (!trimmedName) {
      toast.error(TEXT.workflowNameRequired);
      return;
    }

    try {
      const data = await request.post<CreateWorkflowResponse>(
        `/workflow/templates/${createTemplateId}/create-workflow`,
        {
          workflowName: trimmedName,
          description: workflowDescription.trim(),
        },
      );

      toast.success(TEXT.createSuccess);
      handleCreateModalOpenChange(false);

      if (data?.definitionId) {
        navigate(`/workflow/design?id=${data.definitionId}`);
      } else {
        navigate("/workflow/create");
      }
    } catch (error) {
      console.error(TEXT.createFailed, error);
      toast.error(TEXT.createFailed);
    }
  };

  const pageActions = (
    <div className="template-market-overview">
      <header className="admin-source-header">
        <div>
          <p className="admin-source-kicker">WORKFLOW TEMPLATES</p>
          <h2>{fromCreateFlow ? TEXT.createFromTemplateTitle : TEXT.pageTitle}</h2>
          <span>{fromCreateFlow ? TEXT.createFromTemplateDescription : TEXT.pageDescription}</span>
          <div className="admin-source-context-row">
            <span className="admin-source-context-chip">
              <strong>{hasActiveFilters ? TEXT.activeFilters : "当前目录"}</strong>
              <em>{selectedCategoryName}</em>
            </span>
            <span className="admin-source-context-chip">
              <strong>{TEXT.currentResults}</strong>
              <em>{total}</em>
            </span>
            <span className="admin-source-context-chip">
              <strong>{TEXT.activeFilters}</strong>
              <em>{activeFilterCount}</em>
            </span>
          </div>
        </div>
      </header>

      <section className="admin-source-stat-grid">
        <article className="card admin-source-stat admin-source-tone-blue">
          <div className="admin-source-stat-icon"><Library size={18} /></div>
          <div className="min-w-0">
            <p>{TEXT.currentResults}</p>
            <strong>{total}</strong>
            <span>{hasActiveFilters ? TEXT.activeFilters : TEXT.defaultViewHint}</span>
          </div>
        </article>
        <article className="card admin-source-stat admin-source-tone-green">
          <div className="admin-source-stat-icon"><FolderTree size={18} /></div>
          <div className="min-w-0">
            <p>{TEXT.categoryCount}</p>
            <strong>{categories.length}</strong>
            <span>{TEXT.categoryNavigation}</span>
          </div>
        </article>
        <article className="card admin-source-stat admin-source-tone-amber">
          <div className="admin-source-stat-icon"><Filter size={18} /></div>
          <div className="min-w-0">
            <p>{TEXT.activeFilters}</p>
            <strong>{activeFilterCount}</strong>
            <span>{selectedCategoryName}</span>
          </div>
        </article>
        <article className="card admin-source-stat admin-source-tone-violet">
          <div className="admin-source-stat-icon"><ShieldCheck size={18} /></div>
          <div className="min-w-0">
            <p>{TEXT.systemTemplate}</p>
            <strong>{systemTemplateCount}</strong>
            <span>{TEXT.systemTemplateHint}</span>
          </div>
        </article>
      </section>
    </div>
  );

  const pageFilters = (
        <TemplateLibraryToolbar
          searchTerm={searchTerm}
          hasActiveFilters={hasActiveFilters}
          fromCreateFlow={fromCreateFlow}
          canManageTemplates={canManageTemplates}
          categories={categories}
          recommendedTags={recommendedTags}
          selectedCategory={selectedCategory}
          selectedCategoryName={selectedCategoryName}
          selectedTags={selectedTags}
          total={total}
          onSearchChange={handleSearchChange}
          onCategoryChange={handleCategoryChange}
          onClearFilters={clearFilters}
          onClearCategory={() => handleCategoryChange("")}
          onClearSearch={() => handleSearchChange("")}
          onToggleTag={toggleTag}
          onBackToCreateFlow={() => navigate("/workflow/create")}
          onStartBlankWorkflow={() =>
            navigate("/workflow/design?mode=blank&entry=create")
          }
          onManageTemplates={() => navigate("/templates/manage")}
        />
  );

  const pageContent = (
        <TemplateLibraryResults
          templates={templates}
          loading={loading}
          loadError={loadError}
          total={total}
          pageSize={pageSize}
          currentPage={currentPage}
          hasActiveFilters={hasActiveFilters}
          userLoggedIn={Boolean(user)}
          templateInsights={templateInsights}
          onRetry={() => void loadTemplates()}
          onClearFilters={clearFilters}
          onPreview={handlePreview}
          onUseTemplate={handleCreateFromTemplate}
          onPageChange={setCurrentPage}
        />
  );

  return (
    <section className="admin-source-page template-market-page">
        <TablePageLayout
          className="template-market-layout"
          actions={pageActions}
          filters={pageFilters}
          table={pageContent}
        />

        <TemplateLibraryPreviewDialog
          open={showPreview}
          template={previewTemplate}
          previewGraph={previewGraph}
          previewTags={previewTags}
          previewNodeTypes={previewNodeTypes}
          previewOverviewStats={previewOverviewStats}
          userLoggedIn={Boolean(user)}
          onOpenChange={handlePreviewOpenChange}
          onUseTemplate={handleCreateFromTemplate}
        />

        <TemplateLibraryCreateDialog
          open={showCreateModal}
          workflowName={workflowName}
          workflowDescription={workflowDescription}
          onWorkflowNameChange={setWorkflowName}
          onWorkflowDescriptionChange={setWorkflowDescription}
          onClose={() => handleCreateModalOpenChange(false)}
          onSubmit={() => void submitCreateWorkflow()}
        />
    </section>
  );
};

export default TemplateLibrary;
