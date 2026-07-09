import React, { useEffect, useMemo, useState } from 'react';
import { BookUser, Building2, Eye, RotateCcw, Search, Users } from 'lucide-react';
import { toast } from 'sonner';
import { BaseDialog, Pagination } from '@/components/common';
import {
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/common';
import { contactApi, Contact, DeptNode } from '../services/api/contact';
import { getErrorMessage } from '@/utils/errorMessage';
import { InnerTableSurface, TablePageLayout } from '@/components/layout/TablePageLayout';

const PAGE_SIZE = 20;

const avatarFallback = (seed: string) =>
  `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(seed)}`;

const TableStateRow: React.FC<{
  colSpan: number;
  title: string;
  description?: string;
  icon?: React.ReactNode;
  loading?: boolean;
}> = ({ colSpan, title, description, icon, loading = false }) => (
  <tr className="hover:bg-transparent">
    <td colSpan={colSpan} className="px-4 py-10">
      <div className="flex flex-col items-center justify-center text-center">
        <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-md border border-cyan-100 bg-[#effbfe] text-[#0d95b5] dark:border-cyan-900/60 dark:bg-cyan-950/30 dark:text-cyan-200">
          {loading ? <Search className="h-4 w-4" /> : icon || <Users className="h-4 w-4" />}
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
  <div className="border-b border-slate-200 pb-3 dark:border-slate-800">
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

interface FlatDeptNode extends DeptNode {
  depth: number;
}

const flattenDeptTree = (
  nodes: DeptNode[],
  depth = 0,
  result: FlatDeptNode[] = [],
): FlatDeptNode[] => {
  nodes.forEach((node) => {
    result.push({ ...node, depth });
    if (node.children?.length) {
      flattenDeptTree(node.children, depth + 1, result);
    }
  });

  return result;
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
  const flatDepts = useMemo(() => flattenDeptTree(deptTree), [deptTree]);
  const selectedDept = useMemo(() => findDeptById(deptTree, selectedDeptId), [deptTree, selectedDeptId]);

  const hasActiveFilters = Boolean(keyword || selectedDeptId);
  const statCards = [
    { label: '联系人', value: String(total), detail: keyword || '当前筛选', icon: Users, tone: 'blue' },
    { label: '部门', value: String(depts.length), detail: selectedDept?.dept_name || '全部部门', icon: Building2, tone: 'green' },
    { label: '当前页', value: String(pageNum), detail: `每页 ${PAGE_SIZE}`, icon: BookUser, tone: 'amber' },
    { label: '已加载', value: String(contacts.length), detail: loading ? '读取中' : '列表记录', icon: Users, tone: 'violet' },
  ];

  const pageActions = (
    <div className="space-y-5">
      <header className="admin-source-header">
        <div>
          <p className="admin-source-kicker">CONTACTS</p>
          <h2>通讯录</h2>
          <span>按组织部门检索成员，查看员工联系方式和基础名片</span>
        </div>
        <div className="admin-source-controls">
          <Button variant="outline" size="sm" onClick={() => { void loadDepts(); void fetchContacts(); }} disabled={loading}>
            <RotateCcw size={16} className={loading ? 'animate-spin' : undefined} />
            刷新通讯录
          </Button>
        </div>
      </header>

      <section className="admin-source-stat-grid">
        {statCards.map((stat) => {
          const Icon = stat.icon;
          return (
            <article key={stat.label} className={`card admin-source-stat admin-source-tone-${stat.tone}`}>
              <div className="admin-source-stat-icon"><Icon size={18} /></div>
              <div>
                <p>{stat.label}</p>
                <strong>{stat.value}</strong>
                <span>{stat.detail}</span>
              </div>
            </article>
          );
        })}
      </section>
    </div>
  );

  const pageFilters = (
    <section className="card admin-users-toolbar">
      <div className="admin-toolbar-filter-grid">
        <label className="min-w-0">
          <span className="input-label">联系人搜索</span>
          <div className="admin-source-search-field">
            <Search size={16} />
            <Input
              className="h-[42px]"
              type="search"
              value={keywordDraft}
              onChange={event => setKeywordDraft(event.target.value)}
              onKeyDown={event => {
                if (event.key === 'Enter') {
                  handleApplyFilters();
                }
              }}
              placeholder="姓名、用户名、手机号或邮箱"
            />
          </div>
        </label>

        <label className="min-w-0">
          <span className="input-label">部门</span>
          <Select
            value={selectedDeptId === undefined ? '' : String(selectedDeptId)}
            onValueChange={(value) => {
              setSelectedDeptId(value ? Number(value) : undefined);
              setPageNum(1);
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="全部部门" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="" label="全部部门">
                <span className="flex w-full items-center justify-between gap-3">
                  <span>全部部门</span>
                  <span className="text-xs text-slate-400">{flatDepts.length}</span>
                </span>
              </SelectItem>
              {flatDepts.map((dept) => (
                <SelectItem key={dept.dept_id} value={String(dept.dept_id)} label={dept.dept_name}>
                  <span className="flex w-full items-center justify-between gap-3">
                    <span className="truncate">{`${'　'.repeat(dept.depth)}${dept.dept_name}`}</span>
                    <span className="text-xs text-slate-400">{dept.children?.length || 0}</span>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>

        <div className="admin-users-toolbar-actions">
          {hasActiveFilters ? (
            <span className="admin-users-filter-count">{`${selectedDept?.dept_name || '全部部门'} / ${keyword || '全部关键字'}`}</span>
          ) : null}
          <Button variant="outline" size="sm" onClick={handleApplyFilters}>
            <Search size={14} />
            应用
          </Button>
          <Button variant="outline" size="sm" onClick={handleResetFilters} disabled={!hasActiveFilters && !keywordDraft}>
            <RotateCcw size={14} />
            重置
          </Button>
        </div>
      </div>
    </section>
  );

  const pageTable = (
    <InnerTableSurface
      className="flex min-h-0 flex-1 flex-col"
      wrapperClassName="flex min-h-0 flex-1 flex-col overflow-hidden"
    >
      <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-2.5 dark:border-slate-800">
        <div className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
          {selectedDept?.dept_name || '联系人列表'}
        </div>
        <div className="text-[11px] tabular-nums text-slate-400 dark:text-slate-500">
          {total} 条 · 表格视图
        </div>
      </div>

      <div className="admin-horizontal-scroll min-h-0 flex-1 overflow-auto">
        <table className="unity-data-table admin-source-table min-w-[860px]">
          <thead>
            <tr>
              <th>联系人</th>
              <th>组织</th>
              <th>联系方式</th>
              <th className="text-right">操作</th>
            </tr>
          </thead>
          <tbody>
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
                <tr key={contact.user_id}>
                  <td>
                    <div className="flex items-center gap-3">
                      <img
                        src={contact.avatar || avatarFallback(contact.nick_name || String(contact.user_id))}
                        className="h-9 w-9 rounded-md border border-slate-200 dark:border-slate-800"
                        alt=""
                      />
                      <div className="min-w-0">
                        <div className="truncate font-medium text-slate-900 dark:text-slate-100">
                          {contact.nick_name}
                        </div>
                        <div className="truncate text-xs text-slate-500 dark:text-slate-400">
                          {contact.user_name || '-'}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <div className="font-medium text-slate-900 dark:text-slate-100">{contact.dept_name || '-'}</div>
                    <div className="mt-1 text-xs text-slate-400 dark:text-slate-500">{contact.post_name || '-'}</div>
                  </td>
                  <td>
                    <div>{contact.phonenumber || '-'}</div>
                    <div className="mt-1 text-xs text-slate-400 dark:text-slate-500">{contact.email || '-'}</div>
                  </td>
                  <td>
                    <div className="admin-users-row-actions">
                      <button type="button" title="查看" aria-label="查看" onClick={() => void handleViewUser(contact.user_id)}>
                        <Eye size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </InnerTableSurface>
  );

  const pagePagination = total > 0 ? (
    <Pagination
      total={total}
      page={pageNum}
      pageSize={PAGE_SIZE}
      showPageSizeSelector={false}
      showJump={false}
      onPageChange={setPageNum}
      onPageSizeChange={() => {}}
    />
  ) : null;

  return (
    <section className="admin-source-page">
      <TablePageLayout
        actions={pageActions}
        filters={pageFilters}
        table={pageTable}
        pagination={pagePagination}
      />

      <BaseDialog
        open={Boolean(selectedUser)}
        title={selectedUser?.nick_name || '联系人名片'}
        onClose={() => setSelectedUser(null)}
        maxWidthClassName="max-w-lg"
        bodyClassName="admin-dialog-stack"
        footer={
          <div className="flex justify-end">
            <Button variant="outline" onClick={() => setSelectedUser(null)}>
              关闭
            </Button>
          </div>
        }
      >
        {selectedUser ? (
          <div className="admin-dialog-stack">
            <div className="flex items-center gap-3">
              <img
                src={selectedUser.avatar || avatarFallback(selectedUser.nick_name || String(selectedUser.user_id))}
                className="h-14 w-14 rounded-md border border-slate-200 dark:border-slate-800"
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
    </section>
  );
};

export default ContactPage;

