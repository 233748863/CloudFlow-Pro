import React, { useEffect, useState } from 'react';
import { Edit, Plus, RefreshCw, RotateCcw, Search, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { getErrorMessage } from '@/utils/errorMessage';
import { addPost, deletePost, getPostList, updatePost, type SysPost } from '../../services/api/system';
import { BaseDialog, ConfirmDialog, Pagination } from '@/components/common';
import { TablePageLayout } from '@/components/layout/TablePageLayout';
import {
  Button,
  Input,
  LoadingSpinner,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Table,
  TableActionHead,
  TableRowActions,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Textarea,
} from '@/components/common';
import { cn } from '@/utils/cn';

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
const fieldLabelClassName = 'mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-200';

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
  <TableRow className="hover:bg-transparent dark:hover:bg-transparent">
    <TableCell colSpan={colSpan} className="px-4 py-16">
      <div className="flex flex-col items-center justify-center text-center">
        {loading ? <LoadingSpinner size="lg" className="mb-3" /> : null}
        <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{title}</div>
        {description ? (
          <div className="mt-2 text-xs leading-6 text-slate-500 dark:text-slate-400">
            {description}
          </div>
        ) : null}
      </div>
    </TableCell>
  </TableRow>
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
    pageSize: 10,
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

  return (
    <>
      <TablePageLayout
        className="gap-3"
        filters={(
          <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-950/88">
            <form onSubmit={handleSearch} className="flex flex-1 flex-wrap items-center gap-3">
              <div className="relative w-full sm:w-52">
                <Search
                  size={16}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500"
                />
                <Input
                  value={filters.postName}
                  onChange={(event) =>
                    setFilters((current) => ({ ...current, postName: event.target.value }))
                  }
                  placeholder="按岗位名称搜索"
                  className="h-10 pl-10"
                />
              </div>

              <div className="w-full sm:w-44">
                <Input
                  value={filters.postCode}
                  onChange={(event) =>
                    setFilters((current) => ({ ...current, postCode: event.target.value }))
                  }
                  placeholder="岗位编码"
                  className="h-10"
                />
              </div>

              <div className="w-full sm:w-36">
                <Select
                  value={filters.status || DEFAULT_STATUS_VALUE}
                  onValueChange={(value) =>
                    setFilters((current) => ({
                      ...current,
                      status: value === DEFAULT_STATUS_VALUE ? '' : value,
                    }))
                  }
                >
                  <SelectTrigger className="h-10">
                    <SelectValue placeholder="全部状态" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={DEFAULT_STATUS_VALUE}>全部状态</SelectItem>
                    <SelectItem value="0">正常</SelectItem>
                    <SelectItem value="1">停用</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Button type="submit" size="sm">
                查询
              </Button>

              {hasActiveFilters ? (
                <Button type="button" variant="outline" size="sm" onClick={handleReset}>
                  <RotateCcw size={14} />
                  重置
                </Button>
              ) : null}
            </form>

            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={handleRefresh} disabled={loading}>
                <RefreshCw size={15} className={cn(loading && 'animate-spin')} />
                刷新
              </Button>
              <Button size="sm" onClick={() => handleOpenModal()}>
                <Plus size={15} />
                新增岗位
              </Button>
            </div>
          </div>
        )}
        table={(
          <>
            <div className="overflow-x-auto">
              <Table className="min-w-[920px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>ID</TableHead>
                    <TableHead>岗位编码</TableHead>
                    <TableHead>岗位名称</TableHead>
                    <TableHead>排序</TableHead>
                    <TableHead>状态</TableHead>
                    <TableHead>创建时间</TableHead>
                    <TableActionHead className="w-32">操作</TableActionHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableStateRow colSpan={7} title="正在加载岗位列表..." loading />
                  ) : error ? (
                    <TableStateRow
                      colSpan={7}
                      title="岗位列表加载失败"
                      description={error}
                    />
                  ) : posts.length === 0 ? (
                    <TableStateRow colSpan={7} title="暂无岗位数据" />
                  ) : (
                    posts.map((post) => (
                      <TableRow key={post.postId}>
                        <TableCell className="text-sm text-slate-500 dark:text-slate-400">
                          {post.postId}
                        </TableCell>
                        <TableCell>
                          <span className="font-medium text-slate-900 dark:text-slate-100">
                            {post.postCode}
                          </span>
                        </TableCell>
                        <TableCell>{post.postName}</TableCell>
                        <TableCell>{post.postSort}</TableCell>
                        <TableCell>
                          <span
                            className={cn(
                              'inline-flex rounded-full px-2.5 py-1 text-xs font-medium',
                              getStatusBadgeClassName(post.status),
                            )}
                          >
                            {post.status === '0' ? '正常' : '停用'}
                          </span>
                        </TableCell>
                        <TableCell className="text-sm text-slate-500 dark:text-slate-400">
                          {post.createTime || '-'}
                        </TableCell>
                        <TableCell>
                          <TableRowActions
                            align="end"
                            actions={[
                              {
                                label: '编辑岗位',
                                icon: <Edit size={15} />,
                                onClick: () => handleOpenModal(post),
                                tone: 'neutral',
                              },
                              {
                                label: '删除岗位',
                                icon: <Trash2 size={15} />,
                                onClick: () => setPendingDeletePost(post),
                                tone: 'danger',
                              },
                            ]}
                          />
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </>
        )}
        pagination={(
          total > 0 ? (
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
          ) : null
        )}
      />

      <BaseDialog
        open={isModalOpen}
        title={isEdit ? '编辑岗位' : '新增岗位'}
        onClose={handleCloseModal}
        maxWidthClassName="max-w-2xl"
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
        <form id="post-form" onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className={fieldLabelClassName}>
                岗位编码 <span className="text-rose-500">*</span>
              </label>
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

            <div>
              <label className={fieldLabelClassName}>
                岗位名称 <span className="text-rose-500">*</span>
              </label>
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

            <div>
              <label className={fieldLabelClassName}>显示排序</label>
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

            <div>
              <label className={fieldLabelClassName}>状态</label>
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

          <div>
            <label className={fieldLabelClassName}>备注</label>
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

