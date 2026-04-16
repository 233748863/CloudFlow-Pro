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
import { Button, Input } from '@/components/ui';
import { WorkspaceBackdrop, WorkspaceInlineState } from '@/components/workspace/WorkspacePrimitives';
import {
  WorkspaceDialogShell,
  WorkspaceHeroCard,
  WorkspaceMetricCard,
  WorkspaceResultCard,
  WorkspaceSectionCard,
  WorkspaceWorkbenchCard,
} from '@/components/workspace/WorkspacePanels';
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
    loadDepts();
  }, []);

  useEffect(() => {
    fetchContacts();
  }, [keyword, selectedDeptId, pageNum]);

  const loadDepts = async () => {
    try {
      const res = await contactApi.deptTree();
      if (res) {
        setDepts(Array.isArray(res) ? res : []);
      }
    } catch {
      // 通讯录页允许部门树静默失败，只保留联系人检索。
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

  return (
    <div className="relative min-h-screen pb-6">
      <WorkspaceBackdrop />

      <div className="relative z-10 space-y-6 p-6">
        <WorkspaceHeroCard
          badge={
            <span className="inline-flex items-center gap-2 rounded-full bg-white/82 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-pink-500 ring-1 ring-white/80 shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
              <BookUser className="h-3.5 w-3.5" />
              Contact Workspace
            </span>
          }
          title="企业通讯录"
          description="用统一工作台视图查看部门联系人、快速检索员工信息，并直接打开名片详情。"
        >
          <div className="mt-6 grid gap-4 xl:grid-cols-4">
            <WorkspaceMetricCard
              label="通讯录总量"
              value={total}
              hint="当前筛选条件下的联系人总数"
              aside={<Users className="h-[18px] w-[18px] text-pink-500" />}
            />
            <WorkspaceMetricCard
              label="部门数量"
              value={topDepts.length}
              hint="左侧一级部门导航数量"
              aside={<Building2 className="h-[18px] w-[18px] text-sky-500" />}
            />
            <WorkspaceMetricCard
              label="当前部门"
              value={selectedDept?.dept_name || '全部部门'}
              hint="正在浏览的联系人范围"
              aside={<BookUser className="h-[18px] w-[18px] text-amber-500" />}
            />
            <WorkspaceMetricCard
              label="当前页码"
              value={`${pageNum} / ${totalPages}`}
              hint="每页展示 20 条联系人记录"
              aside={<User className="h-[18px] w-[18px] text-emerald-500" />}
            />
          </div>
        </WorkspaceHeroCard>

        <WorkspaceWorkbenchCard
          eyebrow="目录筛选"
          title="部门导航与联系人检索"
          total={total}
          hasActiveFilters={hasActiveFilters}
          overviewItems={[
            { label: '搜索关键词', value: keyword || '未设置' },
            { label: '部门筛选', value: selectedDept?.dept_name || '全部部门' },
            { label: '当前结果', value: contacts.length },
            { label: '筛选状态', value: hasActiveFilters ? '已启用' : '默认视图' },
          ]}
          filterBar={
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div className="flex flex-1 flex-col gap-3 xl:flex-row xl:items-center">
                <div className="relative flex-1 max-w-xl">
                  <Search
                    size={16}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                  />
                  <Input
                    value={keywordInput}
                    onChange={(event) => setKeywordInput(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        handleApplyFilters();
                      }
                    }}
                    placeholder="搜索姓名、用户名或手机号"
                    className="pl-10"
                  />
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={handleApplyFilters}>
                    <Search className="h-4 w-4" />
                    搜索
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleResetFilters}>
                    <RotateCcw className="h-4 w-4" />
                    重置
                  </Button>
                </div>
              </div>
              <div className="text-xs text-slate-400">点击联系人卡片可直接查看员工名片详情。</div>
            </div>
          }
        />

        <div className="grid gap-6 xl:grid-cols-[260px_minmax(0,1fr)]">
          <WorkspaceSectionCard
            title="部门导航"
            description="快速切换联系人视图范围。"
            eyebrow="Department"
            className="self-start"
            bodyClassName="space-y-2"
          >
            <button
              type="button"
              onClick={() => {
                setSelectedDeptId(undefined);
                setPageNum(1);
              }}
              className={cn(
                'flex w-full items-center gap-2 rounded-2xl px-3 py-2.5 text-left text-sm font-medium transition',
                !selectedDeptId
                  ? 'bg-pink-50 text-pink-600 ring-1 ring-pink-100'
                  : 'bg-white/80 text-slate-600 ring-1 ring-white/80 hover:bg-white',
              )}
            >
              <BookUser className="h-4 w-4" />
              全部部门
            </button>

            {topDepts.length === 0 ? (
              <WorkspaceInlineState
                icon={<Building2 className="h-5 w-5" />}
                title="暂无部门数据"
                description="部门树未返回数据，仍可使用关键词搜索联系人。"
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
                      'flex w-full items-center gap-2 rounded-2xl px-3 py-2.5 text-left text-sm font-medium transition',
                      active
                        ? 'bg-pink-50 text-pink-600 ring-1 ring-pink-100'
                        : 'bg-white/80 text-slate-600 ring-1 ring-white/80 hover:bg-white',
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
            description="统一展示联系人卡片、联系方式与所属部门。"
            footer={
              <div className="flex items-center justify-between border-t border-white/70 bg-[linear-gradient(180deg,rgba(248,250,252,0.72),rgba(255,255,255,0.6))] px-4 py-3">
                <span className="rounded-full bg-white/82 px-3 py-1.5 text-[11px] font-medium text-slate-500 ring-1 ring-white/80 shadow-[0_8px_18px_rgba(15,23,42,0.04)]">
                  共 {total} 人
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setPageNum((prev) => Math.max(1, prev - 1))}
                    disabled={pageNum === 1}
                    className="h-9 rounded-2xl border border-white/80 bg-white/76 px-3 text-sm text-slate-700 shadow-[0_8px_18px_rgba(15,23,42,0.04)] transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    上一页
                  </button>
                  <span className="rounded-full bg-white/76 px-3 py-2 text-sm text-slate-600 ring-1 ring-white/80 shadow-[0_8px_18px_rgba(15,23,42,0.04)]">
                    第 {pageNum} / {totalPages} 页
                  </span>
                  <button
                    type="button"
                    onClick={() => setPageNum((prev) => prev + 1)}
                    disabled={pageNum >= totalPages}
                    className="h-9 rounded-2xl border border-white/80 bg-white/76 px-3 text-sm text-slate-700 shadow-[0_8px_18px_rgba(15,23,42,0.04)] transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    下一页
                  </button>
                </div>
              </div>
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
                  description="当前筛选条件下没有匹配的联系人，试试切换部门或调整关键词。"
                  className="py-16"
                />
              ) : (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {contacts.map((contact) => (
                    <button
                      key={contact.user_id}
                      type="button"
                      onClick={() => handleViewUser(contact.user_id)}
                      className="rounded-[24px] border border-white/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.92),rgba(248,250,252,0.82))] p-4 text-left shadow-[0_14px_30px_rgba(15,23,42,0.04),inset_0_1px_0_rgba(255,255,255,0.72)] transition hover:-translate-y-1 hover:border-pink-100 hover:shadow-[0_18px_34px_rgba(236,72,153,0.08)]"
                    >
                      <div className="flex items-center gap-3">
                        <img
                          src={contact.avatar || avatarFallback(contact.nick_name || String(contact.user_id))}
                          className="h-12 w-12 rounded-full border border-slate-200"
                          alt=""
                        />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-semibold text-slate-900">
                            {contact.nick_name}
                          </div>
                          <div className="text-xs text-slate-500">{contact.post_name || '员工'}</div>
                        </div>
                      </div>

                      <div className="mt-4 space-y-2 text-xs text-slate-600">
                        <div className="flex items-center gap-2">
                          <Building2 className="h-3.5 w-3.5 text-pink-400" />
                          <span className="truncate">{contact.dept_name || '-'}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Phone className="h-3.5 w-3.5 text-pink-400" />
                          <span>{contact.phonenumber || '-'}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Mail className="h-3.5 w-3.5 text-pink-400" />
                          <span className="truncate">{contact.email || '-'}</span>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </WorkspaceResultCard>
        </div>
      </div>

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
                src={selectedUser.avatar || avatarFallback(selectedUser.nick_name || String(selectedUser.user_id))}
                className="mx-auto mb-3 h-20 w-20 rounded-full border-2 border-pink-100"
                alt=""
              />
              <div className="text-lg font-bold text-slate-800">{selectedUser.nick_name}</div>
              <div className="text-sm text-slate-500">{selectedUser.post_name || '员工'}</div>
            </div>

            <div className="space-y-3">
              {[
                {
                  icon: <Building2 size={16} className="text-pink-400" />,
                  label: '部门',
                  value: selectedUser.dept_name || '-',
                },
                {
                  icon: <Phone size={16} className="text-pink-400" />,
                  label: '电话',
                  value: selectedUser.phonenumber || '-',
                },
                {
                  icon: <Mail size={16} className="text-pink-400" />,
                  label: '邮箱',
                  value: selectedUser.email || '-',
                },
                {
                  icon: <User size={16} className="text-pink-400" />,
                  label: '用户名',
                  value: selectedUser.user_name || '-',
                },
              ].map((item) => (
                <div
                  key={item.label}
                  className="flex items-center gap-3 rounded-[20px] bg-slate-50/90 p-3 ring-1 ring-slate-100"
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
              <Button onClick={() => setSelectedUser(null)}>关闭</Button>
            </div>
          </div>
        </WorkspaceDialogShell>
      ) : null}
    </div>
  );
};

export default ContactPage;
