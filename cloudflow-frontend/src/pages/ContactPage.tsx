import React, { useEffect, useMemo, useState } from 'react';
import { BookUser, Building2, ChevronDown, ChevronRight, Eye, RotateCcw, Search, Users } from 'lucide-react';
import { toast } from 'sonner';
import { BaseDialog, Pagination } from '@/components/common';
import {
  Button,
  Input,
} from '@/components/common';
import { contactApi, Contact, DeptNode } from '../services/api/contact';
import { getErrorMessage } from '@/utils/errorMessage';
import { TablePageLayout } from '@/components/layout/TablePageLayout';
import { cn } from '@/utils/cn';

const PAGE_SIZE = 20;

const avatarFallback = (seed: string) =>
  `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(seed)}`;

const ContactEmptyState: React.FC<{
  title: string;
  description?: string;
  icon?: React.ReactNode;
  loading?: boolean;
}> = ({ title, description, icon, loading = false }) => (
  <div className="col-span-full flex flex-col items-center justify-center px-6 py-12 text-center">
    <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-md border border-cyan-100 bg-[#effbfe] text-[#0d95b5] dark:border-cyan-900/60 dark:bg-cyan-950/30 dark:text-cyan-200">
      {loading ? <Search className="h-4 w-4" /> : icon || <Users className="h-4 w-4" />}
    </div>
    <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{title}</div>
    {description ? <div className="mt-2 text-xs leading-6 text-slate-500 dark:text-slate-400">{description}</div> : null}
  </div>
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

// 递归收集某节点及其全部后代的 dept_id（用于树上显示的"是否含选中后代"高亮）
const collectDescendantDeptIds = (node: DeptNode, acc: Set<number>): Set<number> => {
  acc.add(node.dept_id);
  (node.children || []).forEach((child) => collectDescendantDeptIds(child, acc));
  return acc;
};

const TreeNode: React.FC<{
  node: DeptNode;
  depth: number;
  selectedDeptId?: number;
  expanded: Set<number>;
  filteredSet: Set<number>;
  onSelect: (deptId?: number) => void;
  onToggle: (deptId: number) => void;
}> = ({ node, depth, selectedDeptId, expanded, filteredSet, onSelect, onToggle }) => {
  const hasChildren = Boolean(node.children && node.children.length > 0);
  const isExpanded = expanded.has(node.dept_id);
  const isSelected = selectedDeptId === node.dept_id;
  const childCount = node.children?.length || 0;

  return (
    <div>
      <div
        className={cn(
          'admin-contact-tree-row',
          isSelected && 'is-active',
        )}
        style={{ paddingLeft: `${depth * 14 + 4}px` }}
        onClick={() => onSelect(node.dept_id)}
        role="treeitem"
        aria-selected={isSelected}
      >
        <button
          type="button"
          className="admin-contact-tree-toggle"
          onClick={(event) => {
            event.stopPropagation();
            onToggle(node.dept_id);
          }}
          aria-label={isExpanded ? '折叠' : '展开'}
        >
          {hasChildren ? (
            isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />
          ) : (
            <span className="admin-contact-tree-toggle-placeholder" />
          )}
        </button>
        <Building2 size={13} className="admin-contact-tree-icon" />
        <span className="admin-contact-tree-label" title={node.dept_name}>
          {node.dept_name}
        </span>
        {childCount > 0 ? (
          <span className="admin-contact-tree-count">{childCount}</span>
        ) : null}
      </div>
      {hasChildren && isExpanded ? (
        <div>
          {(node.children || []).map((child) => {
            if (!filteredSet.has(child.dept_id)) return null;
            return (
              <TreeNode
                key={child.dept_id}
                node={child}
                depth={depth + 1}
                selectedDeptId={selectedDeptId}
                expanded={expanded}
                filteredSet={filteredSet}
                onSelect={onSelect}
                onToggle={onToggle}
              />
            );
          })}
        </div>
      ) : null}
    </div>
  );
};

const DeptTreePanel: React.FC<{
  deptTree: DeptNode[];
  selectedDeptId?: number;
  onSelect: (deptId?: number) => void;
}> = ({ deptTree, selectedDeptId, onSelect }) => {
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  // 初次加载部门树后默认展开根节点，方便快速定位
  useEffect(() => {
    setExpanded(new Set(deptTree.map((node) => node.dept_id)));
  }, [deptTree]);

  const matches = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) return null;
    const result = new Set<number>();
    const walk = (nodes: DeptNode[]) => {
      nodes.forEach((node) => {
        if (node.dept_name.toLowerCase().includes(keyword)) {
          collectDescendantDeptIds(node, result);
        }
        if (node.children?.length) walk(node.children);
      });
    };
    walk(deptTree);
    return result;
  }, [search, deptTree]);

  // 当搜索命中时，把命中节点的祖先链路也加入展开集合，确保可见
  const expandedWithAncestors = useMemo((): Set<number> => {
    if (!matches) return expanded;
    const merged = new Set(expanded);
    const walk = (nodes: DeptNode[]): boolean => {
      let hit = false;
      nodes.forEach((node) => {
        const childHit = node.children?.length ? walk(node.children) : false;
        if (matches.has(node.dept_id) || childHit) {
          hit = true;
          merged.add(node.dept_id);
        }
      });
      return hit;
    };
    walk(deptTree);
    return merged;
  }, [matches, expanded, deptTree]);

  const filteredSet = useMemo(() => {
    if (matches) return matches;
    // 无搜索时全部可见
    const all = new Set<number>();
    deptTree.forEach((root) => collectDescendantDeptIds(root, all));
    return all;
  }, [matches, deptTree]);

  const toggle = (deptId: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(deptId)) next.delete(deptId);
      else next.add(deptId);
      return next;
    });
  };

  return (
    <aside className="admin-contact-tree">
      <div className="admin-contact-tree-header">
        <div className="admin-contact-tree-title">
          <Building2 size={14} />
          <span>部门筛选</span>
        </div>
        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
          <Input
            className="h-9 rounded-md pl-8 text-sm"
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="搜索部门"
          />
        </div>
      </div>

      <div
        className={cn(
          'admin-contact-tree-item',
          selectedDeptId === undefined && 'is-active',
        )}
        onClick={() => onSelect(undefined)}
        role="treeitem"
        aria-selected={selectedDeptId === undefined}
      >
        <span className="admin-contact-tree-toggle-placeholder" />
        <Users size={13} className="admin-contact-tree-icon" />
        <span className="admin-contact-tree-label">全部成员</span>
      </div>

      <div className="admin-contact-tree-list">
        {deptTree.length === 0 ? (
          <div className="px-3 py-6 text-center text-xs text-slate-400 dark:text-slate-500">
            暂无部门数据
          </div>
        ) : (
          deptTree.map((node) => {
            if (!filteredSet.has(node.dept_id)) return null;
            return (
              <TreeNode
                key={node.dept_id}
                node={node}
                depth={0}
                selectedDeptId={selectedDeptId}
                expanded={expandedWithAncestors}
                filteredSet={filteredSet}
                onSelect={onSelect}
                onToggle={toggle}
              />
            );
          })
        )}
      </div>
    </aside>
  );
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

  const handleSelectDept = (deptId?: number) => {
    setSelectedDeptId(deptId);
    setPageNum(1);
  };

  const handleResetFilters = () => {
    setSelectedDeptId(undefined);
    setKeyword('');
    setKeywordDraft('');
    setPageNum(1);
  };

  const deptTree = useMemo(() => buildDeptTree(depts), [depts]);
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
              onChange={(event) => setKeywordDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  handleApplyFilters();
                }
              }}
              placeholder="姓名、用户名、手机号或邮箱"
            />
          </div>
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
    <div className="admin-contact-split">
      <DeptTreePanel
        deptTree={deptTree}
        selectedDeptId={selectedDeptId}
        onSelect={handleSelectDept}
      />

      <div className="admin-contact-main">
        <div className="admin-contact-main-head">
          <div className="min-w-0">
            <div className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
              {selectedDept?.dept_name || '全部成员'}
            </div>
            <div className="text-[11px] tabular-nums text-slate-400 dark:text-slate-500">
              {total} 条 · 卡片视图
            </div>
          </div>
          {selectedDept ? (
            <Button variant="outline" size="sm" onClick={() => handleSelectDept(undefined)}>
              <RotateCcw size={14} />
              清除部门筛选
            </Button>
          ) : null}
        </div>

        <div className="admin-contact-grid">
          {loading ? (
            <ContactEmptyState title="正在加载通讯录..." loading />
          ) : contacts.length === 0 ? (
            <ContactEmptyState
              title="暂无匹配联系人"
              description={hasActiveFilters ? '可以调整关键字或左侧部门筛选。' : '新成员加入后会显示在这里。'}
              icon={<Users className="h-4 w-4" />}
            />
          ) : (
            contacts.map((contact) => (
              <button
                key={contact.user_id}
                type="button"
                onClick={() => void handleViewUser(contact.user_id)}
                className="admin-contact-card group"
              >
                <div className="flex items-start gap-3">
                  <img
                    src={contact.avatar || avatarFallback(contact.nick_name || String(contact.user_id))}
                    className="h-12 w-12 flex-shrink-0 rounded-md border border-slate-200 dark:border-slate-800"
                    alt=""
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                        {contact.nick_name}
                      </span>
                      <span className="inline-flex flex-shrink-0 items-center gap-1 rounded-md border border-cyan-100 bg-[#effbfe] px-2 py-0.5 text-[11px] font-medium text-[#0d95b5] opacity-0 transition-opacity group-hover:opacity-100 dark:border-cyan-900/60 dark:bg-cyan-950/30 dark:text-cyan-200">
                        <Eye size={11} />
                        查看
                      </span>
                    </div>
                    <div className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">
                      {contact.dept_name || '未分配部门'}
                      {contact.post_name ? <span className="text-slate-400 dark:text-slate-500"> · {contact.post_name}</span> : null}
                    </div>
                  </div>
                </div>
                <div className="mt-3 grid gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-slate-400 dark:text-slate-500">电话</span>
                    <span className="truncate">{contact.phonenumber || '-'}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-slate-400 dark:text-slate-500">邮箱</span>
                    <span className="truncate">{contact.email || '-'}</span>
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
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
    <section className="admin-source-page admin-contact-page">
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

