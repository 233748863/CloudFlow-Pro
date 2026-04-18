import React, { useEffect, useMemo, useState } from 'react';
import {
  BookUser,
  Building2,
  Mail,
  Phone,
  RotateCcw,
  Search,
  User,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';
import { SearchInput } from '@/components/common';
import { Button, Card } from '@/components/ui';
import {
  WorkspaceBackdrop,
  WorkspaceDialogShell,
  WorkspaceHeroMetricsSection,
  WorkspaceInlineState,
  WorkspacePageContent,
  WorkspacePaginationBar,
  WorkspaceResultCard,
  WorkspaceSectionCard,
  WorkspaceWorkbenchCard,
  workspaceGlassSurfaceClassName,
} from '@/components/workspace';
import { contactApi, Contact, DeptNode } from '../services/api/contact';
import { getErrorMessage } from '@/utils/errorMessage';
import { cn } from '@/utils/cn';

const avatarFallback = (seed: string) =>
  `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(seed)}`;

export const ContactPage: React.FC = () => {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [depts, setDepts] = useState<DeptNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [keywordInput, setKeywordInput] = useState('');
  const [selectedDeptId, setSelectedDeptId] = useState<number | undefined>();
  const [total, setTotal] = useState(0);
  const [pageNum, setPageNum] = useState(1);
  const [selectedUser, setSelectedUser] = useState<Contact | null>(null);

  useEffect(() => {
    void loadDepts();
  }, []);

  useEffect(() => {
    void fetchContacts();
  }, [keyword, selectedDeptId, pageNum]);

  const loadDepts = async () => {
    try {
      const res = await contactApi.deptTree();
      if (res) {
        setDepts(Array.isArray(res) ? res : []);
      }
    } catch {
      // 通讯录允许部门树静默失败，仍然保留联系人搜索能力。
    }
  };

  const fetchContacts = async () => {
    setLoading(true);
    try {
      const res = await contactApi.list({
        keyword,
        deptId: selectedDeptId,
        pageNum,
        pageSize: 20,
      });
      if (res) {
        setContacts(res.records || res.rows || []);
        setTotal(res.total || 0);
      }
    } catch (error) {
      toast.error(getErrorMessage(error, '获取通讯录失败'));
    } finally {
      setLoading(false);
    }
  };

  const handleViewUser = async (userId: number) => {
    try {
      const res = await contactApi.getUserDetail(userId);
      if (res) {
        setSelectedUser(res);
      }
    } catch (error) {
      toast.error(getErrorMessage(error, '获取用户详情失败'));
    }
  };

  const handleApplyFilters = () => {
    setKeyword(keywordInput.trim());
    setPageNum(1);
  };

  const handleResetFilters = () => {
    setKeyword('');
    setKeywordInput('');
    setSelectedDeptId(undefined);
    setPageNum(1);
  };

  const topDepts = useMemo(
    () => depts.filter((dept) => dept.parent_id === 0 || dept.parent_id === 100),
    [depts],
  );

  const totalPages = Math.max(1, Math.ceil(total / 20));
  const hasActiveFilters = Boolean(keyword || selectedDeptId);
  const selectedDept = topDepts.find((dept) => dept.dept_id === selectedDeptId);

  // 统一把页头统计收口到公共 Hero 组件，后续继续收紧样式时只需要调整公共层。
  const heroMetrics = useMemo(
    () => [
      {
        label: '当前联系人',
        value: `${total}`,
        hint: keyword ? `关键字：${keyword}` : '默认展示当前目录范围内的联系人',
        icon: <Users size={17} />,
      },
      {
        label: '一级部门',
        value: `${topDepts.length}`,
        hint: '支持按部门切换通讯录范围',
        icon: <Building2 size={17} />,
      },
      {
        label: '当前范围',
        value: selectedDept?.dept_name || '全部部门',
        hint: hasActiveFilters ? '已应用目录或关键词筛选' : '未额外限制部门范围',
        icon: <BookUser size={17} />,
      },
      {
        label: '当前页码',
        value: `${pageNum} / ${totalPages}`,
        hint: '左侧目录与右侧联系人列表保持同一工作台',
        icon: <Search size={17} />,
      },
    ],
    [hasActiveFilters, keyword, pageNum, selectedDept?.dept_name, topDepts.length, total, totalPages],
  );

  const overviewItems = [
    {
      label: '搜索关键字',
      value: keyword || '未设置',
    },
    {
      label: '部门范围',
      value: selectedDept?.dept_name || '全部部门',
    },
    {
      label: '当前结果',
      value: contacts.length,
    },
    {
      label: '视图状态',
      value: hasActiveFilters ? '筛选结果' : '默认视图',
    },
  ];

  return (
    <div className="relative min-h-screen pb-6">
      <WorkspaceBackdrop />

      <WorkspacePageContent>
        <WorkspaceHeroMetricsSection
          badge={
            <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-600">
              <BookUser className="h-3.5 w-3.5" />
              通讯录工作台
            </span>
          }
          title="企业通讯录"
          description="按部门和关键字快速检索联系人，并在同一工作台里查看员工名片。"
          contentClassName="p-3.5 sm:p-4"
          metrics={heroMetrics}
        >
          <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-[11px] font-medium text-slate-500">
            点击联系人卡片可直接查看名片详情
          </div>
        </WorkspaceHeroMetricsSection>

        <Card className={`${workspaceGlassSurfaceClassName} p-3`}>
          <div className="flex flex-col gap-3">
            <WorkspaceWorkbenchCard
              eyebrow="目录检索"
              title="部门导航与联系人搜索"
              total={total}
              hasActiveFilters={hasActiveFilters}
              overviewItems={overviewItems}
              quickFilterAside={
                <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-[11px] font-medium text-slate-500">
                  目录筛选与搜索结果同步联动
                </span>
              }
              filterBar={
                <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                  <div className="flex flex-1 flex-col gap-2.5 xl:flex-row xl:items-center">
                    <SearchInput
                      value={keywordInput}
                      onChange={setKeywordInput}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            handleApplyFilters();
                          }
                        }}
                        placeholder="搜索姓名、用户名或手机号"
                      className="max-w-xl flex-1"
                      inputClassName="h-10 rounded-[18px] pr-4"
                      />

                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" className="h-10 rounded-[18px]" onClick={handleApplyFilters}>
                        <Search className="h-4 w-4" />
                        搜索
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-10 rounded-[18px] px-4"
                        onClick={handleResetFilters}
                      >
                        <RotateCcw className="h-4 w-4" />
                        重置
                      </Button>
                    </div>
                  </div>

                  <div className="text-xs text-slate-400">左侧切部门，右侧直接打开联系人卡片</div>
                </div>
              }
            />

            <div className="grid gap-3 xl:grid-cols-[240px_minmax(0,1fr)]">
              <WorkspaceSectionCard
                title="部门导航"
                description="快速切换联系人范围"
                eyebrow="Department"
                className="self-start"
                bodyClassName="space-y-2.5"
              >
                <button
                  type="button"
                  onClick={() => {
                    setSelectedDeptId(undefined);
                    setPageNum(1);
                  }}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition',
                    !selectedDeptId
                      ? 'border border-cyan-200 bg-cyan-50 text-cyan-700'
                      : 'border border-transparent text-slate-600 hover:bg-slate-50',
                  )}
                >
                  <BookUser className="h-4 w-4" />
                  全部部门
                </button>

                {topDepts.length === 0 ? (
                  <WorkspaceInlineState
                    icon={<Building2 className="h-5 w-5" />}
                    title="暂无部门数据"
                    description="部门树暂未返回数据，仍可使用关键字检索联系人。"
                    className="py-10"
                  />
                ) : (
                  topDepts.map((dept) => {
                    const active = selectedDeptId === dept.dept_id;
                    return (
                      <button
                        key={dept.dept_id}
                        type="button"
                        onClick={() => {
                          setSelectedDeptId(dept.dept_id);
                          setPageNum(1);
                        }}
                        className={cn(
                          'flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition',
                          active
                            ? 'border border-cyan-200 bg-cyan-50 text-cyan-700'
                            : 'border border-transparent text-slate-600 hover:bg-slate-50',
                        )}
                      >
                        <Building2 className="h-4 w-4 opacity-70" />
                        <span className="truncate">{dept.dept_name}</span>
                      </button>
                    );
                  })
                )}
              </WorkspaceSectionCard>

              <WorkspaceResultCard
                total={total}
                title="联系人列表"
                description="集中查看联系人、部门与联系方式"
                footer={
                  <WorkspacePaginationBar
                    total={total}
                    pageNum={pageNum}
                    totalPages={totalPages}
                    onPrev={() => setPageNum((prev) => Math.max(1, prev - 1))}
                    onNext={() => setPageNum((prev) => prev + 1)}
                    prevDisabled={pageNum === 1}
                    nextDisabled={pageNum >= totalPages}
                  />
                }
              >
                <div className="p-4">
                  {loading ? (
                    <WorkspaceInlineState
                      type="loading"
                      title="正在加载通讯录..."
                      description="系统正在同步联系人和部门数据。"
                      className="py-16"
                    />
                  ) : contacts.length === 0 ? (
                    <WorkspaceInlineState
                      icon={<BookUser className="h-5 w-5" />}
                      title="暂无匹配联系人"
                      description="当前筛选条件下没有匹配的联系人，试试切换部门或调整关键字。"
                      className="py-16"
                    />
                  ) : (
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                      {contacts.map((contact) => (
                        <button
                          key={contact.user_id}
                          type="button"
                          onClick={() => void handleViewUser(contact.user_id)}
                          className="card card-hover rounded-2xl p-4 text-left"
                        >
                          <div className="flex items-center gap-3">
                            <img
                              src={
                                contact.avatar ||
                                avatarFallback(contact.nick_name || String(contact.user_id))
                              }
                              className="h-12 w-12 rounded-full border border-slate-200"
                              alt=""
                            />
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-sm font-semibold text-slate-900">
                                {contact.nick_name}
                              </div>
                              <div className="text-xs text-slate-500">
                                {contact.post_name || '员工'}
                              </div>
                            </div>
                          </div>

                          <div className="mt-4 flex flex-wrap gap-2 text-xs text-slate-600">
                            <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1">
                              <Building2 className="h-3.5 w-3.5 text-cyan-500" />
                              <span className="truncate">{contact.dept_name || '-'}</span>
                            </span>
                            <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1">
                              <Phone className="h-3.5 w-3.5 text-cyan-500" />
                              <span>{contact.phonenumber || '-'}</span>
                            </span>
                            <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1">
                              <Mail className="h-3.5 w-3.5 text-cyan-500" />
                              <span className="truncate">{contact.email || '-'}</span>
                            </span>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </WorkspaceResultCard>
            </div>
          </div>
        </Card>
      </WorkspacePageContent>

      {selectedUser ? (
        <WorkspaceDialogShell
          title={selectedUser.nick_name}
          description={selectedUser.post_name || '员工名片'}
          onClose={() => setSelectedUser(null)}
          maxWidthClassName="max-w-md"
        >
          <div className="space-y-5">
            <div className="text-center">
              <img
                src={
                  selectedUser.avatar ||
                  avatarFallback(selectedUser.nick_name || String(selectedUser.user_id))
                }
                className="mx-auto mb-3 h-20 w-20 rounded-full border-2 border-cyan-100"
                alt=""
              />
              <div className="text-lg font-semibold text-slate-800">{selectedUser.nick_name}</div>
              <div className="text-sm text-slate-500">{selectedUser.post_name || '员工'}</div>
            </div>

            <div className="space-y-3">
              {[
                {
                  icon: <Building2 size={16} className="text-cyan-500" />,
                  label: '部门',
                  value: selectedUser.dept_name || '-',
                },
                {
                  icon: <Phone size={16} className="text-cyan-500" />,
                  label: '电话',
                  value: selectedUser.phonenumber || '-',
                },
                {
                  icon: <Mail size={16} className="text-cyan-500" />,
                  label: '邮箱',
                  value: selectedUser.email || '-',
                },
                {
                  icon: <User size={16} className="text-cyan-500" />,
                  label: '用户名',
                  value: selectedUser.user_name || '-',
                },
              ].map((item) => (
                <div
                  key={item.label}
                  className="flex items-center gap-3 rounded-[18px] bg-slate-50/90 p-3 ring-1 ring-slate-100"
                >
                  {item.icon}
                  <div>
                    <div className="text-xs text-slate-500">{item.label}</div>
                    <div className="text-sm text-slate-800">{item.value}</div>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-end">
              <Button variant="outline" className="rounded-[18px]" onClick={() => setSelectedUser(null)}>
                关闭
              </Button>
            </div>
          </div>
        </WorkspaceDialogShell>
      ) : null}
    </div>
  );
};

export default ContactPage;
