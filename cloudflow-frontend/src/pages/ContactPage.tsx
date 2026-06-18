import React, { useEffect, useMemo, useState } from 'react';
import { BookUser, Building2, ChevronDown, ChevronRight, Eye, RotateCcw, Search, Users } from 'lucide-react';
import { toast } from 'sonner';
import { BaseDialog, Pagination } from '@/components/common';
import {
  Button,
  Input,
  SideNavItem,
  Table,
  TableActionHead,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/common';
import { TablePageLayout, TableSurfaceCard } from '@/components/layout/TablePageLayout';
import { TableRowActions } from '@/components/common/table-row-actions';
import { contactApi, Contact, DeptNode } from '../services/api/contact';
import { getErrorMessage } from '@/utils/errorMessage';

const PAGE_SIZE = 20;

const avatarFallback = (seed: string) =>
  `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(seed)}`;

const InlineState: React.FC<{
  title: string;
  description?: string;
  icon?: React.ReactNode;
  className?: string;
}> = ({ title, description, icon, className }) => (
  <div className={['flex flex-col items-center justify-center px-6 py-10 text-center', className].filter(Boolean).join(' ')}>
    <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-400 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-500">
      {icon || <Users className="h-4 w-4" />}
    </div>
    <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{title}</div>
    {description ? <div className="mt-2 text-xs leading-6 text-slate-500 dark:text-slate-400">{description}</div> : null}
  </div>
);

const TableStateRow: React.FC<{
  colSpan: number;
  title: string;
  description?: string;
  icon?: React.ReactNode;
  loading?: boolean;
}> = ({ colSpan, title, description, icon, loading = false }) => (
  <tr className="hover:bg-transparent">
    <td colSpan={colSpan} className="px-4 py-16">
      <div className="flex flex-col items-center justify-center text-center">
        <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-400 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-500">
          {loading ? <Search className="h-4 w-4 animate-pulse" /> : icon || <Users className="h-4 w-4" />}
        </div>
        <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{title}</div>
        {description ? <div className="mt-2 text-xs leading-6 text-slate-500 dark:text-slate-400">{description}</div> : null}
      </div>
    </td>
  </tr>
);

const DetailRows: React.FC<{
  children: React.ReactNode;
  className?: string;
}> = ({ children, className }) => (
  <div className={['grid gap-x-6 gap-y-3 sm:grid-cols-2', className].filter(Boolean).join(' ')}>
    {children}
  </div>
);

const DetailRow: React.FC<{
  label: string;
  value: React.ReactNode;
}> = ({ label, value }) => (
  <div className="border-b border-slate-100 pb-3 dark:border-slate-800">
    <div className="text-[11px] font-medium text-slate-400 dark:text-slate-500">{label}</div>
    <div className="mt-1.5 text-sm leading-6 text-slate-900 dark:text-slate-100">{value}</div>
  </div>
);

const buildDeptTree = (depts: DeptNode[]) => {
  const nodeMap = new Map<number, DeptNode & { children: DeptNode[] }>();
  depts.forEach((dept) => {
    nodeMap.set(dept.dept_id, { ...dept, children: [] });
  });
  const roots: Array<DeptNode & { children: DeptNode[] }> = [];
  nodeMap.forEach((dept) => {
    const parent = nodeMap.get(dept.parent_id);
    if (parent && dept.parent_id !== dept.dept_id) {
      parent.children.push(dept);
    } else {
      roots.push(dept);
    }
  });
  const sortNodes = (nodes: Array<DeptNode & { children: DeptNode[] }>) => {
    nodes.sort((a, b) => (a.order_num || 0) - (b.order_num || 0));
    nodes.forEach((node) => sortNodes(node.children as Array<DeptNode & { children: DeptNode[] }>));
  };
  sortNodes(roots);
  return roots;
};

const findDeptById = (depts: DeptNode[], deptId?: number): DeptNode | undefined => {
  if (!deptId) {
    return undefined;
  }
  for (const dept of depts) {
    if (dept.dept_id === deptId) {
      return dept;
    }
    const child = findDeptById(dept.children || [], deptId);
    if (child) {
      return child;
    }
  }
  return undefined;
};

export const ContactPage: React.FC = () => {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [depts, setDepts] = useState<DeptNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [keywordDraft, setKeywordDraft] = useState('');
  const [selectedDeptId, setSelectedDeptId] = useState<number | undefined>();
  const [total, setTotal] = useState(0);
  const [pageNum, setPageNum] = useState(1);
  const [selectedUser, setSelectedUser] = useState<Contact | null>(null);
  const [expandedDeptIds, setExpandedDeptIds] = useState<Set<number>>(new Set());

  useEffect(() => {
    void loadDepts();
  }, []);

  useEffect(() => {
    void fetchContacts();
  }, [keyword, selectedDeptId, pageNum]);

  const loadDepts = async () => {
    try {
      const response = await contactApi.deptTree();
      setDepts(Array.isArray(response) ? response : []);
    } catch {
      // 部门树失败时仍允许按关键字搜索联系人。
      setDepts([]);
    }
  };

  const fetchContacts = async () => {
    setLoading(true);
    try {
      const response = await contactApi.list({
        keyword,
        deptId: selectedDeptId,
        pageNum,
        pageSize: PAGE_SIZE,
      });
      const nextContacts = Array.isArray(response.records)
        ? response.records
        : Array.isArray(response.rows)
          ? response.rows
          : [];
      setContacts(nextContacts);
      setTotal(response.total || 0);
    } catch (error) {
      setContacts([]);
      setTotal(0);
      toast.error(getErrorMessage(error, '获取通讯录失败'));
    } finally {
      setLoading(false);
    }
  };

  const handleViewUser = async (userId: number) => {
    try {
      const response = await contactApi.getUserDetail(userId);
      if (response && typeof response === 'object') {
        setSelectedUser(response);
      } else {
        toast.error(getErrorMessage(response, '获取用户详情失败'));
      }
    } catch (error) {
      toast.error(getErrorMessage(error, '获取用户详情失败'));
    }
  };

  const handleApplyFilters = () => {
    setKeyword(keywordDraft.trim());
    setPageNum(1);
  };

  const handleResetFilters = () => {
    setKeyword('');
    setKeywordDraft('');
    setSelectedDeptId(undefined);
    setPageNum(1);
  };

  const deptTree = useMemo(() => buildDeptTree(depts), [depts]);
  const selectedDept = useMemo(() => findDeptById(deptTree, selectedDeptId), [deptTree, selectedDeptId]);

  useEffect(() => {
    setExpandedDeptIds((previous) => {
      const next = new Set(previous);
      deptTree.forEach((dept) => next.add(dept.dept_id));
      return next;
    });
  }, [deptTree]);

  const toggleDeptExpand = (deptId: number) => {
    setExpandedDeptIds((previous) => {
      const next = new Set(previous);
      if (next.has(deptId)) {
        next.delete(deptId);
      } else {
        next.add(deptId);
      }
      return next;
    });
  };

  const renderDeptNode = (dept: DeptNode, depth = 0): React.ReactNode => {
    const children = dept.children || [];
    const hasChildren = children.length > 0;
    const expanded = expandedDeptIds.has(dept.dept_id);
    const active = selectedDeptId === dept.dept_id;

    return (
      <div key={dept.dept_id}>
        <div
          className={[
            'group flex items-center gap-1 rounded-lg pr-2 text-sm transition',
            active
              ? 'bg-cyan-50 text-cyan-700 dark:bg-cyan-950/30 dark:text-cyan-200'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-900 dark:hover:text-slate-100',
          ].join(' ')}
          style={{ paddingLeft: `${depth * 12 + 8}px` }}
        >
          <button
            type="button"
            className="flex h-8 w-5 shrink-0 items-center justify-center text-slate-400 hover:text-slate-700 dark:text-slate-500 dark:hover:text-slate-200"
            onClick={() => toggleDeptExpand(dept.dept_id)}
          >
            {hasChildren ? (expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />) : <span className="w-3.5" />}
          </button>
          <button
            type="button"
            className="flex min-w-0 flex-1 items-center gap-2 py-1.5 text-left"
            onClick={() => {
              setSelectedDeptId(dept.dept_id);
              setPageNum(1);
            }}
          >
            <Building2 className="h-4 w-4 shrink-0 opacity-70" />
            <span className="truncate">{dept.dept_name}</span>
          </button>
        </div>
        {expanded ? children.map((child) => renderDeptNode(child, depth + 1)) : null}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <TablePageLayout
        className="gap-4"
        filters={
          <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-slate-800 dark:bg-slate-950/88 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-1 flex-wrap items-center gap-3">
              <div className="relative min-w-[220px] flex-1 lg:max-w-sm">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  value={keywordDraft}
                  onChange={event => setKeywordDraft(event.target.value)}
                  onKeyDown={event => {
                    if (event.key === 'Enter') {
                      handleApplyFilters();
                    }
                  }}
                  placeholder="搜索姓名、用户名、手机号或邮箱"
                  className="h-10 pl-10"
                />
              </div>

              <div className="flex min-w-[220px] flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                <span>{selectedDept?.dept_name || '全部部门'}</span>
                <span>{keyword || '全部关键字'}</span>
                <span>共 {total} 条</span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 lg:justify-end">
              <Button variant="outline" size="sm" onClick={handleApplyFilters}>
                <Search className="mr-1.5 h-4 w-4" />
                应用
              </Button>
              <Button variant="outline" size="sm" onClick={handleResetFilters}>
                <RotateCcw className="mr-1.5 h-4 w-4" />
                清空条件
              </Button>
            </div>
          </div>
        }
        table={(<TableSurfaceCard><div className="grid min-h-[40rem] xl:grid-cols-[184px_minmax(0,1fr)]">
            <aside className="border-b border-slate-200 bg-slate-50/40 dark:border-slate-800 dark:bg-slate-950/20 xl:border-b-0 xl:border-r">
              <div className="space-y-1 p-3">
                <div className="px-2.5 pb-2 text-[11px] font-medium uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">
                  部门
                </div>
                <SideNavItem
                  size="sm"
                  active={!selectedDeptId}
                  onClick={() => {
                    setSelectedDeptId(undefined);
                    setPageNum(1);
                  }}
                >
                  <BookUser className="h-4 w-4" />
                  全部部门
                </SideNavItem>

                {deptTree.length === 0 ? (
                  <InlineState
                    title="暂无部门数据"
                    className="py-8"
                    icon={<Building2 className="h-4 w-4" />}
                  />
                ) : (
                  deptTree.map((dept) => renderDeptNode(dept, 0))
                )}
              </div>
            </aside>

            <div className="flex min-h-0 flex-col">
              <div className="overflow-x-auto">
                <Table className="min-w-[860px]">
                  <TableHeader className="sticky top-0 z-10">
                    <TableRow className="border-slate-100 bg-transparent hover:bg-transparent dark:border-slate-800">
                      <TableHead className="px-4 py-3 text-left">联系人</TableHead>
                      <TableHead className="px-4 py-3 text-left">组织</TableHead>
                      <TableHead className="px-4 py-3 text-left">联系方式</TableHead>
                      <TableActionHead className="w-24 px-4 py-3 text-right">操作</TableActionHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {loading ? (
                      <TableStateRow colSpan={4} title="正在加载通讯录..." loading />
                    ) : contacts.length === 0 ? (
                      <TableStateRow
                        colSpan={4}
                        title="暂无匹配联系人"
                        icon={<Users className="h-4 w-4" />}
                      />
                    ) : (
                      contacts.map(contact => (
                        <TableRow key={contact.user_id} className="transition hover:bg-slate-50 dark:hover:bg-slate-900/60">
                          <TableCell className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              <img
                                src={contact.avatar || avatarFallback(contact.nick_name || String(contact.user_id))}
                                className="h-9 w-9 rounded-full border border-slate-200 dark:border-slate-800"
                                alt=""
                              />
                              <div className="min-w-0">
                                <div className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                                  {contact.nick_name}
                                </div>
                                <div className="truncate text-xs text-slate-500 dark:text-slate-400">
                                  {contact.user_name || '-'}
                                </div>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="px-4 py-3 text-sm text-slate-600 dark:text-slate-300">
                            <div className="font-medium text-slate-900 dark:text-slate-100">{contact.dept_name || '-'}</div>
                            <div className="mt-1 text-xs text-slate-400 dark:text-slate-500">{contact.post_name || '-'}</div>
                          </TableCell>
                          <TableCell className="px-4 py-3 text-sm text-slate-600 dark:text-slate-300">
                            <div>{contact.phonenumber || '-'}</div>
                            <div className="mt-1 text-xs text-slate-400 dark:text-slate-500">{contact.email || '-'}</div>
                          </TableCell>
                          <TableCell className="px-4 py-3 text-right">
                            <TableRowActions
                              align="end"
                              actions={[
                                {
                                  label: '查看',
                                  icon: <Eye className="h-4 w-4" />,
                                  onClick: () => void handleViewUser(contact.user_id),
                                  tone: 'neutral',
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
            </div>
          </div></TableSurfaceCard>)}
        pagination={
          total > 0 ? (
            <Pagination
              total={total}
              page={pageNum}
              pageSize={PAGE_SIZE}
              showPageSizeSelector={false}
              showJump={false}
              onPageChange={setPageNum}
              onPageSizeChange={() => {}}
            />
          ) : null
        }
      />

      <BaseDialog
        open={Boolean(selectedUser)}
        title={selectedUser?.nick_name || '联系人名片'}
        onClose={() => setSelectedUser(null)}
        maxWidthClassName="max-w-lg"
        footer={
          <div className="flex justify-end">
            <Button variant="outline" onClick={() => setSelectedUser(null)}>
              关闭
            </Button>
          </div>
        }
      >
        {selectedUser ? (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <img
                src={selectedUser.avatar || avatarFallback(selectedUser.nick_name || String(selectedUser.user_id))}
                className="h-14 w-14 rounded-full border border-slate-200 dark:border-slate-800"
                alt=""
              />
              <div className="min-w-0">
                <div className="text-base font-semibold text-slate-900 dark:text-slate-100">{selectedUser.nick_name}</div>
                <div className="text-sm text-slate-500 dark:text-slate-400">
                  {selectedUser.dept_name || '-'} / {selectedUser.post_name || '员工'}
                </div>
              </div>
            </div>

            <DetailRows>
              <DetailRow label="部门" value={selectedUser.dept_name || '-'} />
              <DetailRow label="岗位" value={selectedUser.post_name || '-'} />
              <DetailRow label="电话" value={selectedUser.phonenumber || '-'} />
              <DetailRow label="邮箱" value={selectedUser.email || '-'} />
              <DetailRow label="用户名" value={selectedUser.user_name || '-'} />
              <DetailRow label="用户 ID" value={selectedUser.user_id} />
            </DetailRows>
          </div>
        ) : null}
      </BaseDialog>
    </div>
  );
};

export default ContactPage;

