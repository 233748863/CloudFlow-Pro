import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  Eye,
  FolderOpen,
  Grid,
  List,
  Plus,
  Search,
  X
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';
import request from '../services/api/request';
import { parseWorkflowGraphDefinition } from '../utils/workflowGraph';

interface TemplateItem {
  id: string;
  name: string;
  description?: string;
  categoryId?: string;
  categoryName?: string;
  tags?: string[];
  definition?: unknown;
  previewImage?: string;
  usageCount?: number;
  isSystem?: boolean;
  status?: string;
}

interface CategoryNode {
  id: string;
  name: string;
  templateCount?: number;
  children?: CategoryNode[];
}

interface TemplateListResult {
  records: TemplateItem[];
  total: number;
}

interface CreateWorkflowResponse {
  definitionId?: string;
}

interface PreviewNode {
  id: string;
  name: string;
  type: string;
}

interface PreviewEdge {
  source: string;
  target: string;
  condition?: string;
}

const COMMON_TAGS = ['审批', '请假', '报销', '采购', '合同', '财务', '人事'];

/**
 * 统一标签格式。
 * 后端可能返回 string[]、JSON 字符串或逗号分隔字符串，这里全部归一化为 string[]。
 */
const normalizeTags = (rawTags: unknown): string[] => {
  if (Array.isArray(rawTags)) {
    return rawTags.filter((item): item is string => typeof item === 'string');
  }
  if (typeof rawTags !== 'string' || !rawTags.trim()) {
    return [];
  }
  try {
    const parsed = JSON.parse(rawTags);
    if (Array.isArray(parsed)) {
      return parsed.filter((item): item is string => typeof item === 'string');
    }
  } catch {
    return rawTags
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
};

const parseTemplateDefinition = (definition: unknown): { nodes: PreviewNode[]; edges: PreviewEdge[] } => {
  const graph = parseWorkflowGraphDefinition(definition);
  if (!graph) {
    return { nodes: [], edges: [] };
  }

  const nodes = graph.nodes.map((item, index) => {
    const source = (item || {}) as Record<string, unknown>;
    const id = String(source.id ?? ('node-' + (index + 1)));
    const name = String(source.title ?? ('节点 ' + (index + 1)));
    const type = String(source.type ?? 'task');
    return { id, name, type };
  });

  const edges = graph.edges
    .map((item) => {
      const source = item?.source;
      const target = item?.target;
      if (!source || !target) {
        return null;
      }
      const condition =
        typeof item.condition === 'string' && item.condition.trim().length > 0
          ? item.condition.trim()
          : undefined;
      return {
        source: String(source),
        target: String(target),
        condition
      } as PreviewEdge;
    })
    .filter((item): item is PreviewEdge => Boolean(item));

  return { nodes, edges };
};

export const TemplateLibrary: React.FC = () => {
  const { user } = useAuth();

  const [templates, setTemplates] = useState<TemplateItem[]>([]);
  const [categories, setCategories] = useState<CategoryNode[]>([]);
  const [loading, setLoading] = useState(false);

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 12;
  const [total, setTotal] = useState(0);

  const [showPreview, setShowPreview] = useState(false);
  const [previewTemplate, setPreviewTemplate] = useState<TemplateItem | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createTemplateId, setCreateTemplateId] = useState('');
  const [workflowName, setWorkflowName] = useState('');
  const [workflowDescription, setWorkflowDescription] = useState('');

  const previewGraph = useMemo(() => {
    if (!previewTemplate) {
      return { nodes: [], edges: [] };
    }
    return parseTemplateDefinition(previewTemplate.definition);
  }, [previewTemplate]);

  const loadCategories = useCallback(async () => {
    try {
      const data = await request.get<CategoryNode[]>('/workflow/templates/categories');
      setCategories(data || []);
    } catch (error) {
      console.error('加载模板分类失败:', error);
      toast.error('加载模板分类失败');
    }
  }, []);

  const loadTemplates = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string | number> = {
        pageNum: currentPage,
        pageSize
      };
      if (selectedCategory) {
        params.categoryId = selectedCategory;
      }
      if (selectedTags.length > 0) {
        params.tags = selectedTags.join(',');
      }
      if (searchTerm.trim()) {
        params.keyword = searchTerm.trim();
      }

      const data = await request.get<TemplateListResult>('/workflow/templates', { params });
      setTemplates(data?.records || []);
      setTotal(data?.total || 0);
    } catch (error) {
      console.error('加载模板列表失败:', error);
      toast.error('加载模板列表失败');
    } finally {
      setLoading(false);
    }
  }, [currentPage, pageSize, searchTerm, selectedCategory, selectedTags]);

  useEffect(() => {
    void loadCategories();
  }, [loadCategories]);

  useEffect(() => {
    void loadTemplates();
  }, [loadTemplates]);

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) => {
      if (prev.includes(tag)) {
        return prev.filter((item) => item !== tag);
      }
      return [...prev, tag];
    });
    setCurrentPage(1);
  };

  const handlePreview = (template: TemplateItem) => {
    setPreviewTemplate(template);
    setShowPreview(true);
  };

  const handleCreateFromTemplate = (templateId: string) => {
    if (!user) {
      toast.error('请先登录后再使用模板创建流程');
      return;
    }
    setCreateTemplateId(templateId);
    setWorkflowName('');
    setWorkflowDescription('');
    setShowCreateModal(true);
  };

  const submitCreateWorkflow = async () => {
    const trimmedName = workflowName.trim();
    if (!trimmedName) {
      toast.error('请输入流程名称');
      return;
    }

    try {
      // 直接走新路由与新接口，不做旧接口兼容分支，避免双路由维护成本。
      const data = await request.post<CreateWorkflowResponse>(
        `/workflow/templates/${createTemplateId}/create-workflow`,
        {
          workflowName: trimmedName,
          description: workflowDescription.trim()
        }
      );
      toast.success('流程创建成功');
      setShowCreateModal(false);

      const definitionId = data?.definitionId;
      if (definitionId) {
        window.location.href = `/workflow/design?id=${definitionId}`;
      } else {
        window.location.href = '/workflow/design';
      }
    } catch (error) {
      console.error('从模板创建流程失败:', error);
      toast.error('从模板创建流程失败');
    }
  };

  const renderCategoryTree = (nodes: CategoryNode[], level = 0): React.ReactNode => {
    return nodes.map((node) => (
      <div key={node.id} style={{ marginLeft: level * 16 }}>
        <button
          onClick={() => {
            setSelectedCategory(node.id);
            setCurrentPage(1);
          }}
          className={`w-full text-left px-3 py-2 rounded hover:bg-gray-100 ${
            selectedCategory === node.id ? 'bg-blue-50 text-blue-600' : ''
          }`}
        >
          <FolderOpen className="inline w-4 h-4 mr-2" />
          {node.name}
          {Number(node.templateCount || 0) > 0 && (
            <span className="ml-2 text-xs text-gray-500">({node.templateCount})</span>
          )}
        </button>
        {Array.isArray(node.children) && node.children.length > 0 && renderCategoryTree(node.children, level + 1)}
      </div>
    ));
  };

  return (
    <div className="flex h-full">
      <div className="w-64 border-r bg-white p-4 overflow-y-auto">
        <h3 className="font-semibold mb-4">分类</h3>
        <button
          onClick={() => {
            setSelectedCategory('');
            setCurrentPage(1);
          }}
          className={`w-full text-left px-3 py-2 rounded hover:bg-gray-100 mb-2 ${
            !selectedCategory ? 'bg-blue-50 text-blue-600' : ''
          }`}
        >
          全部模板
        </button>
        {renderCategoryTree(categories)}

        <h3 className="font-semibold mt-6 mb-4">常用标签</h3>
        <div className="flex flex-wrap gap-2">
          {COMMON_TAGS.map((tag) => (
            <button
              key={tag}
              onClick={() => toggleTag(tag)}
              className={`px-3 py-1 rounded-full text-sm ${
                selectedTags.includes(tag) ? 'bg-blue-500 text-white' : 'bg-gray-100 hover:bg-gray-200'
              }`}
            >
              {tag}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 p-6 overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="搜索模板..."
              value={searchTerm}
              onChange={(event) => {
                setSearchTerm(event.target.value);
                setCurrentPage(1);
              }}
              className="pl-10 pr-4 py-2 border rounded-lg w-80"
            />
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-2 rounded ${viewMode === 'grid' ? 'bg-blue-100 text-blue-600' : 'hover:bg-gray-100'}`}
            >
              <Grid className="w-5 h-5" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-2 rounded ${viewMode === 'list' ? 'bg-blue-100 text-blue-600' : 'hover:bg-gray-100'}`}
            >
              <List className="w-5 h-5" />
            </button>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-12">加载中...</div>
        ) : templates.length === 0 ? (
          <div className="text-center py-12 text-gray-500">暂无模板</div>
        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {templates.map((template) => (
              <div key={template.id} className="border rounded-lg p-4 hover:shadow-lg transition-shadow">
                <div className="flex items-start justify-between mb-3">
                  <h3 className="font-semibold text-lg">{template.name}</h3>
                  {template.isSystem && (
                    <span className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded">系统</span>
                  )}
                </div>
                <p className="text-sm text-gray-600 mb-4 line-clamp-2">{template.description || '-'}</p>
                <div className="flex flex-wrap gap-2 mb-4">
                  {normalizeTags(template.tags).map((tag) => (
                    <span key={tag} className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded">
                      {tag}
                    </span>
                  ))}
                </div>
                <div className="flex items-center justify-between text-sm text-gray-500 mb-4">
                  <span>使用 {template.usageCount || 0} 次</span>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handlePreview(template)}
                    className="flex-1 px-4 py-2 border rounded hover:bg-gray-50"
                  >
                    <Eye className="inline w-4 h-4 mr-1" />
                    预览
                  </button>
                  <button
                    onClick={() => handleCreateFromTemplate(template.id)}
                    disabled={!user}
                    className="flex-1 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
                    title={!user ? '请先登录' : '使用此模板创建流程'}
                  >
                    <Plus className="inline w-4 h-4 mr-1" />
                    使用
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-4">
            {templates.map((template) => (
              <div key={template.id} className="border rounded-lg p-4 hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="font-semibold text-lg">{template.name}</h3>
                      {template.isSystem && (
                        <span className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded">系统</span>
                      )}
                    </div>
                    <p className="text-sm text-gray-600 mb-3">{template.description || '-'}</p>
                    <div className="flex items-center gap-4 text-sm text-gray-500">
                      <span>使用 {template.usageCount || 0} 次</span>
                      <div className="flex gap-2">
                        {normalizeTags(template.tags).map((tag) => (
                          <span key={tag} className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded">
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2 ml-4">
                    <button
                      onClick={() => handlePreview(template)}
                      className="px-4 py-2 border rounded hover:bg-gray-50"
                    >
                      预览
                    </button>
                    <button
                      onClick={() => handleCreateFromTemplate(template.id)}
                      disabled={!user}
                      className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
                      title={!user ? '请先登录' : '使用此模板创建流程'}
                    >
                      使用模板
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {total > pageSize && (
          <div className="flex justify-center mt-6 gap-2">
            <button
              onClick={() => setCurrentPage((value) => Math.max(1, value - 1))}
              disabled={currentPage === 1}
              className="px-4 py-2 border rounded disabled:opacity-50"
            >
              上一页
            </button>
            <span className="px-4 py-2">
              第 {currentPage} / {Math.ceil(total / pageSize)} 页
            </span>
            <button
              onClick={() => setCurrentPage((value) => Math.min(Math.ceil(total / pageSize), value + 1))}
              disabled={currentPage >= Math.ceil(total / pageSize)}
              className="px-4 py-2 border rounded disabled:opacity-50"
            >
              下一页
            </button>
          </div>
        )}
      </div>

      {showPreview && previewTemplate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-5xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold">{previewTemplate.name}</h2>
              <button onClick={() => setShowPreview(false)} className="p-2 hover:bg-gray-100 rounded">
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-gray-600 mb-4">{previewTemplate.description || '暂无描述'}</p>

            {!!previewTemplate.previewImage && (
              <div className="mb-4">
                <img
                  src={previewTemplate.previewImage}
                  alt={`${previewTemplate.name} 预览图`}
                  className="max-h-56 w-full object-contain border rounded bg-gray-50"
                />
              </div>
            )}

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              <div className="border rounded p-3">
                <div className="text-xs text-gray-500">节点数</div>
                <div className="text-lg font-semibold">{previewGraph.nodes.length}</div>
              </div>
              <div className="border rounded p-3">
                <div className="text-xs text-gray-500">连线数</div>
                <div className="text-lg font-semibold">{previewGraph.edges.length}</div>
              </div>
              <div className="border rounded p-3">
                <div className="text-xs text-gray-500">分类</div>
                <div className="text-sm font-medium">{previewTemplate.categoryName || '-'}</div>
              </div>
              <div className="border rounded p-3">
                <div className="text-xs text-gray-500">标签</div>
                <div className="text-sm font-medium">{normalizeTags(previewTemplate.tags).join(' / ') || '-'}</div>
              </div>
            </div>

            {previewGraph.nodes.length > 0 ? (
              <div className="border rounded p-4 bg-gray-50 mb-4">
                <p className="text-sm text-gray-700 mb-2">流程结构预览</p>
                <div className="flex items-center gap-2 overflow-x-auto pb-2">
                  {previewGraph.nodes.slice(0, 8).map((node, index) => (
                    <React.Fragment key={node.id}>
                      <div className="min-w-[120px] max-w-[180px] border rounded bg-white px-3 py-2">
                        <div className="text-xs text-gray-500">{node.type}</div>
                        <div className="text-sm font-medium truncate" title={node.name}>
                          {node.name}
                        </div>
                      </div>
                      {index < Math.min(previewGraph.nodes.length - 1, 7) && (
                        <ArrowRight className="w-4 h-4 text-gray-400 shrink-0" />
                      )}
                    </React.Fragment>
                  ))}
                </div>

                <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-gray-500 mb-2">节点清单</p>
                    <div className="space-y-1 max-h-44 overflow-y-auto">
                      {previewGraph.nodes.map((node) => (
                        <div key={node.id} className="text-sm bg-white border rounded px-2 py-1">
                          {node.name} <span className="text-gray-400">({node.type})</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-2">连线清单</p>
                    <div className="space-y-1 max-h-44 overflow-y-auto">
                      {previewGraph.edges.length === 0 && (
                        <div className="text-sm text-gray-400">未解析到连线信息</div>
                      )}
                      {previewGraph.edges.map((edge, index) => (
                        <div key={`${edge.source}-${edge.target}-${index}`} className="text-sm bg-white border rounded px-2 py-1">
                          {edge.source} → {edge.target}
                          {edge.condition ? <span className="text-gray-400"> ({edge.condition})</span> : null}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="border rounded p-4 bg-gray-50 mb-4 text-sm text-gray-500">
                未解析到流程定义节点，请检查模板 definition 字段是否为标准 JSON 结构。
              </div>
            )}

            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={() => setShowPreview(false)}
                className="px-4 py-2 border rounded hover:bg-gray-50"
              >
                关闭
              </button>
              <button
                onClick={() => {
                  setShowPreview(false);
                  handleCreateFromTemplate(previewTemplate.id);
                }}
                disabled={!user}
                className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
                title={!user ? '请先登录' : '使用此模板创建流程'}
              >
                使用此模板
              </button>
            </div>
          </div>
        </div>
      )}

      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold">从模板创建流程</h2>
              <button onClick={() => setShowCreateModal(false)} className="p-2 hover:bg-gray-100 rounded">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">流程名称 *</label>
                <input
                  type="text"
                  value={workflowName}
                  onChange={(event) => setWorkflowName(event.target.value)}
                  placeholder="请输入流程名称"
                  className="w-full px-3 py-2 border rounded"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">流程描述</label>
                <textarea
                  value={workflowDescription}
                  onChange={(event) => setWorkflowDescription(event.target.value)}
                  placeholder="请输入流程描述（可选）"
                  rows={3}
                  className="w-full px-3 py-2 border rounded"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 border rounded hover:bg-gray-50"
              >
                取消
              </button>
              <button
                onClick={submitCreateWorkflow}
                className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
              >
                创建
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TemplateLibrary;
