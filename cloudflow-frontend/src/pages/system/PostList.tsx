import React, { useMemo, useState } from 'react';
import { BriefcaseBusiness, Edit, Plus, Search, ShieldCheck, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { addPost, deletePost, getPostList, updatePost, type SysPost } from '../../services/api/system';
import {
  Button,
  Card,
  Input,
  TableActionHead,
  TableHead,
  TableHeader,
  Textarea,
} from '@/components/ui';
import { TableRowActions } from '@/components/ui/table-row-actions';
import {
  WorkspaceBackdrop,
  WorkspaceDialogShell,
  WorkspaceHeroMetricsSection,
  WorkspacePageContent,
  WorkspaceResultCard,
  WorkspaceTableStateRow,
  WorkspaceWorkbenchCard,
  workspaceGlassSurfaceClassName,
} from '@/components/workspace';

const formatDateCN = (date: Date) => {
  const weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
  return `${date.getMonth() + 1}月${date.getDate()}日 ${weekdays[date.getDay()]}`;
};

export const PostList = () => {
  const [posts, setPosts] = useState<SysPost[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPost, setEditingPost] = useState<SysPost | null>(null);
  const [formData, setFormData] = useState<SysPost>({
    postCode: '',
    postName: '',
    postSort: 0,
    status: '0',
    remark: '',
  });

  React.useEffect(() => {
    void fetchPosts();
  }, []);

  const fetchPosts = async () => {
    setLoading(true);
    try {
      const response: any = await getPostList({ postName: searchTerm || undefined });
      const list = Array.isArray(response) ? response : response?.records || response?.rows || [];
      setPosts(list);
    } catch (error) {
      console.error(error);
      toast.error('加载岗位失败');
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async (event: React.FormEvent) => {
    event.preventDefault();
    await fetchPosts();
  };

  const handleOpenModal = (post?: SysPost) => {
    if (post) {
      setEditingPost(post);
      setFormData({ ...post });
    } else {
      setEditingPost(null);
      setFormData({ postCode: '', postName: '', postSort: 0, status: '0', remark: '' });
    }
    setIsModalOpen(true);
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
      if (editingPost) {
        await updatePost({ ...formData, postId: editingPost.postId });
        toast.success('岗位更新成功');
      } else {
        await addPost(formData);
        toast.success('岗位创建成功');
      }
      setIsModalOpen(false);
      await fetchPosts();
    } catch (error) {
      console.error(error);
      toast.error('保存岗位失败');
    }
  };

  const handleDelete = async (postId: number) => {
    if (!window.confirm('确认删除该岗位吗？')) {
      return;
    }

    try {
      await deletePost([postId]);
      toast.success('岗位删除成功');
      await fetchPosts();
    } catch (error) {
      console.error(error);
      toast.error('删除岗位失败');
    }
  };

  const activeCount = useMemo(() => posts.filter((post) => post.status === '0').length, [posts]);
  const disabledCount = posts.length - activeCount;
  const sortedMax = useMemo(
    () => posts.reduce((max, post) => Math.max(max, Number(post.postSort || 0)), 0),
    [posts],
  );
  const todayLabel = formatDateCN(new Date());
  const timeLabel = new Date().toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  });
  const hasActiveFilters = Boolean(searchTerm.trim());
  const isEdit = Boolean(editingPost);

  const overviewItems = [
    { label: '当前结果', value: `${posts.length} 个岗位` },
    { label: '正常状态', value: `${activeCount} 个` },
    { label: '停用状态', value: `${disabledCount} 个` },
    { label: '最高排序', value: `${sortedMax}` },
  ];
  const heroMetrics = [
    {
      label: '岗位总数',
      value: `${posts.length}`,
      hint: '当前查询结果中的岗位数量',
      icon: <BriefcaseBusiness size={17} />,
    },
    {
      label: '正常岗位',
      value: `${activeCount}`,
      hint: '可参与组织分配',
      icon: <ShieldCheck size={17} />,
    },
    {
      label: '停用岗位',
      value: `${disabledCount}`,
      hint: '已下线或暂不启用',
      icon: <Trash2 size={17} />,
    },
    {
      label: '排序上限',
      value: `${sortedMax}`,
      hint: '便于快速判断新增排序区间',
      icon: <Edit size={17} />,
    },
  ];

  return (
    <div className="relative min-h-screen pb-6">
      <WorkspaceBackdrop />

      <WorkspacePageContent>
        <WorkspaceHeroMetricsSection
          badge={(
            <div className="flex flex-wrap items-center gap-2 text-[11px] font-medium text-slate-500">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-slate-600">
                <BriefcaseBusiness size={14} />
                {todayLabel}
              </span>
              <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-slate-500">{timeLabel}</span>
            </div>
          )}
          title="岗位管理"
          description="岗位页也切到统一工作台结构，保持系统管理页与业务申请页一致的节奏和信息层级。"
          actions={(
            <Button size="lg" onClick={() => handleOpenModal()}>
              <Plus size={15} />
              新增岗位
            </Button>
          )}
          contentClassName="p-4 sm:p-5"
          metrics={heroMetrics}
        />

        <Card className={`${workspaceGlassSurfaceClassName} p-3.5`}>
          <div className="flex flex-col gap-3">
            <WorkspaceWorkbenchCard
              title="岗位列表"
              total={posts.length}
              hasActiveFilters={hasActiveFilters}
              overviewItems={overviewItems}
              quickFilterAside={hasActiveFilters ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSearchTerm('');
                    void fetchPosts();
                  }}
                >
                  清空筛选
                </Button>
              ) : (
                <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-[11px] font-medium text-slate-400">
                  当前显示全部岗位
                </span>
              )}
              filterBar={(
                <form onSubmit={handleSearch} className="grid grid-cols-1 gap-2.5 xl:grid-cols-[minmax(0,1fr)_auto]">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                    <Input
                      type="text"
                      placeholder="按岗位名称搜索"
                      className="pl-10"
                      value={searchTerm}
                      onChange={(event) => setSearchTerm(event.target.value)}
                    />
                  </div>
                  <Button type="submit">
                    <Search size={15} />
                    搜索岗位
                  </Button>
                </form>
              )}
            />

            <WorkspaceResultCard
              total={posts.length}
              description="统一展示岗位编码、名称、状态与排序，系统页和业务页使用同一套信息组织方式。"
            >
              <div className="overflow-x-auto">
                <table className="w-full min-w-[920px]">
                  <TableHeader>
                    <tr>
                      <TableHead>ID</TableHead>
                      <TableHead>岗位编码</TableHead>
                      <TableHead>岗位名称</TableHead>
                      <TableHead>排序</TableHead>
                      <TableHead>状态</TableHead>
                      <TableHead>创建时间</TableHead>
                      <TableActionHead className="w-48">操作</TableActionHead>
                    </tr>
                  </TableHeader>
                  <tbody className="divide-y divide-white/60">
                    {loading ? (
                      <WorkspaceTableStateRow colSpan={7} type="loading" title="正在加载岗位数据..." />
                    ) : posts.length === 0 ? (
                      <WorkspaceTableStateRow colSpan={7} title="暂无岗位数据" description="可以先新建岗位，再分配到组织或人员信息中。" />
                    ) : (
                      posts.map((post) => (
                        <tr key={post.postId} className="border-b border-slate-100 transition-colors hover:bg-slate-50/70">
                          <td className="px-4 py-3 text-sm text-slate-500">{post.postId}</td>
                          <td className="px-4 py-3 text-sm font-medium text-slate-900">{post.postCode}</td>
                          <td className="px-4 py-3 text-sm text-slate-700">{post.postName}</td>
                          <td className="px-4 py-3 text-sm text-slate-600">{post.postSort}</td>
                          <td className="px-4 py-3">
                            <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                              post.status === '0'
                                ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100'
                                : 'bg-rose-50 text-rose-600 ring-1 ring-rose-100'
                            }`}>
                              {post.status === '0' ? '正常' : '停用'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-500">{post.createTime || '-'}</td>
                          <td className="px-4 py-3 text-right">
                            <TableRowActions
                              align="end"
                              actions={[
                                {
                                  label: '编辑',
                                  icon: <Edit size={14} />,
                                  onClick: () => handleOpenModal(post),
                                  tone: 'primary',
                                },
                                {
                                  label: '删除',
                                  icon: <Trash2 size={14} />,
                                  onClick: () => handleDelete(post.postId!),
                                  tone: 'danger',
                                },
                              ]}
                            />
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </WorkspaceResultCard>
          </div>
        </Card>

        {isModalOpen ? (
          <WorkspaceDialogShell
            title={isEdit ? '编辑岗位' : '新增岗位'}
            description="按照统一表单结构维护岗位编码、名称、状态和补充说明。"
            onClose={() => setIsModalOpen(false)}
            maxWidthClassName="max-w-3xl"
          >
            <form onSubmit={handleSubmit} className="space-y-4">
              <section className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                <div className="mb-4">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">基础信息</div>
                  <div className="mt-1 text-sm text-slate-500">先定义岗位编码和名称，再设置排序与状态。</div>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700">
                      岗位编码 <span className="text-red-500">*</span>
                    </label>
                    <Input
                      value={formData.postCode}
                      onChange={(event) => setFormData({ ...formData, postCode: event.target.value })}
                      placeholder="如：CEO、CTO"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700">
                      岗位名称 <span className="text-red-500">*</span>
                    </label>
                    <Input
                      value={formData.postName}
                      onChange={(event) => setFormData({ ...formData, postName: event.target.value })}
                      placeholder="岗位名称"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700">显示排序</label>
                    <Input
                      type="number"
                      value={formData.postSort}
                      onChange={(event) => setFormData({ ...formData, postSort: Number(event.target.value) })}
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700">状态</label>
                    <div className="flex gap-4 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
                      {[
                        ['0', '正常'],
                        ['1', '停用'],
                      ].map(([value, label]) => (
                        <label key={value} className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
                          <input
                            type="radio"
                            checked={formData.status === value}
                            onChange={() => setFormData({ ...formData, status: value })}
                            className="accent-slate-700"
                          />
                          <span>{label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              </section>

              <section className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                <div className="mb-4">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">备注</div>
                  <div className="mt-1 text-sm text-slate-500">记录该岗位的适用范围、职责说明或其他维护信息。</div>
                </div>
                <Textarea
                  rows={3}
                  className="resize-none"
                  value={formData.remark || ''}
                  onChange={(event) => setFormData({ ...formData, remark: event.target.value })}
                  placeholder="备注信息"
                />
              </section>

              <div className="flex justify-end gap-3 pt-2">
                <Button variant="outline" type="button" onClick={() => setIsModalOpen(false)}>
                  取消
                </Button>
                <Button type="submit">{isEdit ? '保存修改' : '立即创建'}</Button>
              </div>
            </form>
          </WorkspaceDialogShell>
        ) : null}
      </WorkspacePageContent>
    </div>
  );
};

export default PostList;
