import React, { useEffect, useMemo, useState } from 'react';
import { getConfigIntSync } from '../../hooks/useSystemConfig';
import { SYS_PAGE_DEFAULT_PAGE_SIZE } from '../../constants/sysConfig';
import { BriefcaseBusiness, Edit, Plus, RefreshCw, RotateCcw, Search, ShieldCheck, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { getErrorMessage } from '@/utils/errorMessage';
import { addPost, deletePost, getPostList, updatePost, type SysPost } from '../../services/api/system';
import { BaseDialog, ConfirmDialog, Pagination } from '@/components/common';
import {
  Button,
  Input,
  Label,
  LoadingSpinner,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from '@/components/common';
import { cn } from '@/utils/cn';
import { InnerTableSurface, TablePageLayout } from '@/components/layout/TablePageLayout';

type PostFilters = {
  postCode: string;
  postName: string;
  status: string;
};

type PostQuery = {
  pageNum: number;
  pageSize: number;
  postCode: string;
  postName: string;
  status: string;
};

const DEFAULT_FORM_DATA: SysPost = {
  postCode: '',
  postName: '',
  postSort: 0,
  status: '0',
  remark: '',
};

const DEFAULT_STATUS_VALUE = '__all__';

const getStatusBadgeClassName = (status: string) =>
  status === '0'
    ? 'border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/70 dark:bg-emerald-950/30 dark:text-emerald-200'
    : 'border border-rose-200 bg-rose-50 text-rose-600 dark:border-rose-900/70 dark:bg-rose-950/30 dark:text-rose-200';

const TableStateRow: React.FC<{
  colSpan: number;
  title: string;
  description?: string;
  loading?: boolean;
}> = ({ colSpan, title, description, loading = false }) => (
  <tr className="hover:bg-transparent dark:hover:bg-transparent">
    <td colSpan={colSpan} className="px-4 py-10">
      <div className="flex flex-col items-center justify-center text-center">
        {loading ? <LoadingSpinner size="lg" className="mb-3" /> : null}
        <div className="text-sm font-medium text-cf-title">{title}</div>
        {description ? (
          <div className="mt-2 text-xs leading-6 text-cf-subtle">
            {description}
          </div>
        ) : null}
      </div>
    </td>
  </tr>
);

export const PostList = () => {
  const [posts, setPosts] = useState<SysPost[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<PostFilters>({
    postCode: '',
    postName: '',
    status: '',
  });
  const [query, setQuery] = useState<PostQuery>({
    pageNum: 1,
    pageSize: getConfigIntSync(SYS_PAGE_DEFAULT_PAGE_SIZE, 10),
    postCode: '',
    postName: '',
    status: '',
  });
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPost, setEditingPost] = useState<SysPost | null>(null);
  const [pendingDeletePost, setPendingDeletePost] = useState<SysPost | null>(null);
  const [formData, setFormData] = useState<SysPost>(DEFAULT_FORM_DATA);

  const normalizePostListResponse = (response: any) => {
    if (Array.isArray(response)) {
      return { rows: response as SysPost[], total: response.length };
    }

    const rows = Array.isArray(response?.rows)
      ? response.rows
      : Array.isArray(response?.records)
        ? response.records
        : [];

    return {
      rows,
      total: typeof response?.total === 'number' ? response.total : rows.length,
    };
  };

  const fetchPosts = async (nextQuery: PostQuery = query) => {
    setLoading(true);
    setError(null);

    try {
      const response = await getPostList({
        pageNum: nextQuery.pageNum,
        pageSize: nextQuery.pageSize,
        postCode: nextQuery.postCode || undefined,
        postName: nextQuery.postName || undefined,
        status: nextQuery.status || undefined,
      });

      const normalized = normalizePostListResponse(response);
      setPosts(normalized.rows);
      setTotal(normalized.total);
    } catch (fetchError) {
      console.error(fetchError);
      const message = '加载岗位列表失败，请稍后重试。';
      setError(message);
      setPosts([]);
      setTotal(0);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchPosts();
  }, [query]);

  const isEdit = Boolean(editingPost);
  const hasActiveFilters = Boolean(query.postCode || query.postName || query.status);

  const handleSearch = (event: React.FormEvent) => {
    event.preventDefault();
    setQuery((current) => ({
      ...current,
      pageNum: 1,
      postCode: filters.postCode.trim(),
      postName: filters.postName.trim(),
      status: filters.status,
    }));
  };

  const handleReset = () => {
    const nextFilters = {
      postCode: '',
      postName: '',
      status: '',
    };

    setFilters(nextFilters);
    setQuery((current) => ({
      ...current,
      pageNum: 1,
      postCode: '',
      postName: '',
      status: '',
    }));
  };

  const handleRefresh = () => {
    void fetchPosts();
  };

  const handleOpenModal = (post?: SysPost) => {
    if (post) {
      setEditingPost(post);
      setFormData({
        postId: post.postId,
        postCode: post.postCode,
        postName: post.postName,
        postSort: Number(post.postSort || 0),
        status: post.status || '0',
        remark: post.remark || '',
      });
    } else {
      setEditingPost(null);
      setFormData(DEFAULT_FORM_DATA);
    }

    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingPost(null);
    setFormData(DEFAULT_FORM_DATA);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!formData.postCode.trim()) {
      toast.error('请输入岗位编码');
      return;
    }

    if (!formData.postName.trim()) {
      toast.error('请输入岗位名称');
      return;
    }

    try {
      const payload: SysPost = {
        ...formData,
        postCode: formData.postCode.trim(),
        postName: formData.postName.trim(),
        postSort: Number(formData.postSort || 0),
        remark: formData.remark?.trim() || '',
      };

      if (editingPost?.postId) {
        await updatePost({ ...payload, postId: editingPost.postId });
        toast.success('岗位更新成功');
      } else {
        await addPost(payload);
        toast.success('岗位创建成功');
      }

      handleCloseModal();
      await fetchPosts();
    } catch (submitError) {
      console.error(submitError);
      toast.error(isEdit ? '岗位更新失败' : '岗位创建失败');
    }
  };

  const handleDelete = async () => {
    if (!pendingDeletePost?.postId) {
      return;
    }

    try {
      await deletePost([pendingDeletePost.postId]);
      toast.success('岗位删除成功');

      const nextPage =
        posts.length === 1 && query.pageNum > 1 ? query.pageNum - 1 : query.pageNum;

      setPendingDeletePost(null);
      setQuery((current) => ({
        ...current,
        pageNum: nextPage,
      }));

      if (nextPage === query.pageNum) {
        await fetchPosts();
      }
    } catch (deleteError) {
      console.error(deleteError);
      toast.error(getErrorMessage(deleteError, '岗位删除失败'));
    }
  };

  const stats = useMemo(
    () => [
      {
        label: '岗位总数',
        value: String(total),
        meta: `当前页 ${posts.length}`,
        icon: <BriefcaseBusiness size={18} />,
        tone: 'blue',
      },
      {
        label: '正常岗位',
        value: String(posts.filter((post) => post.status === '0').length),
        meta: '可分配',
        icon: <ShieldCheck size={18} />,
        tone: 'green',
      },
      {
        label: '停用岗位',
        value: String(posts.filter((post) => post.status !== '0').length),
        meta: '受限',
        icon: <BriefcaseBusiness size={18} />,
        tone: 'amber',
      },
      {
        label: '最高排序',
        value: String(posts.reduce((max, post) => Math.max(max, Number(post.postSort || 0)), 0)),
        meta: '本页统计',
        icon: <RefreshCw size={18} />,
        tone: 'violet',
      },
    ],
    [posts, total],
  );

  const pageActions = (
    <div className="grid gap-5">
      <header className="admin-source-header">
        <div>
          <p className="admin-source-kicker">POST MANAGEMENT</p>
          <h2>岗位管理</h2>
          <span>维护岗位编码、名称、排序和启停状态</span>
        </div>
        <div className="admin-source-controls">
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={loading}>
            <RefreshCw size={16} className={cn(loading && 'animate-spin')} />
            刷新
          </Button>
          <Button size="sm" onClick={() => handleOpenModal()}>
            <Plus size={16} />
            新增岗位
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
    </div>
  );

  const pageFilters = (
    <section className="card admin-users-toolbar">
      <form onSubmit={handleSearch} className="admin-posts-filter-grid">
        <label className="admin-source-search">
          <span className="input-label">岗位名称</span>
          <div className="admin-source-search-field">
            <Search size={16} />
            <Input
              value={filters.postName}
              onChange={(event) =>
                setFilters((current) => ({ ...current, postName: event.target.value }))
              }
              placeholder="按岗位名称搜索"
              type="search"
            />
          </div>
        </label>

        <label>
          <span className="input-label">岗位编码</span>
          <Input
            value={filters.postCode}
            onChange={(event) =>
              setFilters((current) => ({ ...current, postCode: event.target.value }))
            }
            placeholder="岗位编码"
          />
        </label>

        <label>
          <span className="input-label">状态</span>
          <Select
            value={filters.status || DEFAULT_STATUS_VALUE}
            onValueChange={(value) =>
              setFilters((current) => ({
                ...current,
                status: value === DEFAULT_STATUS_VALUE ? '' : value,
              }))
            }
          >
            <SelectTrigger className="h-[42px]">
              <SelectValue placeholder="全部状态" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={DEFAULT_STATUS_VALUE}>全部状态</SelectItem>
              <SelectItem value="0">正常</SelectItem>
              <SelectItem value="1">停用</SelectItem>
            </SelectContent>
          </Select>
        </label>

        <div className="admin-users-toolbar-actions">
          <span className="admin-users-filter-count">当前 {total} 项</span>
          <Button type="submit" size="sm">
            查询
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleReset}
            disabled={!hasActiveFilters}
          >
            <RotateCcw size={14} />
            重置
          </Button>
        </div>
      </form>
    </section>
  );

  const pageTable = (
    <InnerTableSurface className="admin-posts-table-panel">
      <table className="unity-data-table admin-source-table admin-posts-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>岗位</th>
              <th>岗位编码</th>
              <th>排序</th>
              <th>状态</th>
              <th>创建时间</th>
              <th className="text-right">操作</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <TableStateRow colSpan={7} title="正在加载岗位列表..." loading />
            ) : error ? (
              <TableStateRow colSpan={7} title="岗位列表加载失败" description={error} />
            ) : posts.length === 0 ? (
              <TableStateRow colSpan={7} title="暂无岗位数据" />
            ) : (
              posts.map((post) => (
                <tr key={post.postId}>
                  <td className="text-sm text-cf-subtle">{post.postId}</td>
                  <td>
                    <div className="admin-posts-name">
                      <span>
                        <BriefcaseBusiness size={16} />
                      </span>
                      <div>
                        <strong>{post.postName}</strong>
                        <small>{post.remark || '岗位权限配置'}</small>
                      </div>
                    </div>
                  </td>
                  <td><code className="admin-source-code">{post.postCode}</code></td>
                  <td>{post.postSort}</td>
                  <td>
                    <span
                      className={cn(
                        'inline-flex rounded-md px-2.5 py-1 text-xs font-medium',
                        getStatusBadgeClassName(post.status),
                      )}
                    >
                      {post.status === '0' ? '正常' : '停用'}
                    </span>
                  </td>
                  <td className="text-sm text-cf-subtle">{post.createTime || '-'}</td>
                  <td>
                    <div className="admin-users-row-actions">
                      <button type="button" data-tooltip="编辑岗位" aria-label="编辑岗位" onClick={() => handleOpenModal(post)}>
                        <Edit size={15} />
                      </button>
                      <button
                        type="button"
                        className="danger"
                        data-tooltip="删除岗位" aria-label="删除岗位"
                        onClick={() => setPendingDeletePost(post)}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
      </table>
    </InnerTableSurface>
  );

  const pagePagination = total > 0 ? (
    <Pagination
      total={total}
      page={query.pageNum}
      pageSize={query.pageSize}
      onPageChange={(pageNum) =>
        setQuery((current) => ({ ...current, pageNum }))
      }
      onPageSizeChange={(pageSize) =>
        setQuery((current) => ({
          ...current,
          pageNum: 1,
          pageSize,
        }))
      }
    />
  ) : null;

  return (
    <>
      <section className="admin-source-page admin-posts-page">
        <TablePageLayout
          actions={pageActions}
          filters={pageFilters}
          table={pageTable}
          pagination={pagePagination}
        />
      </section>

      <BaseDialog
        open={isModalOpen}
        title={isEdit ? '编辑岗位' : '新增岗位'}
        onClose={handleCloseModal}
        maxWidthClassName="max-w-2xl"
        bodyClassName="admin-dialog-stack"
        footer={(
          <>
            <Button variant="outline" onClick={handleCloseModal}>
              取消
            </Button>
            <Button onClick={() => void 0} type="submit" form="post-form">
              {isEdit ? '保存修改' : '创建岗位'}
            </Button>
          </>
        )}
      >
        <form id="post-form" onSubmit={handleSubmit} className="admin-dialog-stack">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="admin-dialog-field">
              <Label>
                岗位编码 <span className="text-rose-500">*</span>
              </Label>
              <Input
                value={formData.postCode}
                onChange={(event) =>
                  setFormData((current) => ({
                    ...current,
                    postCode: event.target.value,
                  }))
                }
                placeholder="例如：CEO、HR_BP"
              />
            </div>

            <div className="admin-dialog-field">
              <Label>
                岗位名称 <span className="text-rose-500">*</span>
              </Label>
              <Input
                value={formData.postName}
                onChange={(event) =>
                  setFormData((current) => ({
                    ...current,
                    postName: event.target.value,
                  }))
                }
                placeholder="请输入岗位名称"
              />
            </div>

            <div className="admin-dialog-field">
              <Label>显示排序</Label>
              <Input
                type="number"
                value={String(formData.postSort ?? 0)}
                onChange={(event) =>
                  setFormData((current) => ({
                    ...current,
                    postSort: Number.parseInt(event.target.value, 10) || 0,
                  }))
                }
                placeholder="请输入排序值"
              />
            </div>

            <div className="admin-dialog-field">
              <Label>状态</Label>
              <Select
                value={formData.status}
                onValueChange={(value) =>
                  setFormData((current) => ({
                    ...current,
                    status: value,
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="请选择状态" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">正常</SelectItem>
                  <SelectItem value="1">停用</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="admin-dialog-field">
            <Label>备注</Label>
              <Textarea
                rows={4}
                className="resize-none"
                value={formData.remark || ''}
                onChange={(event) =>
                  setFormData((current) => ({
                    ...current,
                    remark: event.target.value,
                  }))
                }
              />
            </div>
          </form>
      </BaseDialog>

      <ConfirmDialog
        open={Boolean(pendingDeletePost)}
        title="删除岗位"
        message={
          pendingDeletePost
            ? `确定删除岗位“${pendingDeletePost.postName}”吗？删除后将无法恢复。`
            : ''
        }
        confirmText="确认删除"
        cancelText="取消"
        danger
        onCancel={() => setPendingDeletePost(null)}
        onConfirm={() => void handleDelete()}
      />
    </>
  );
};

export default PostList;
