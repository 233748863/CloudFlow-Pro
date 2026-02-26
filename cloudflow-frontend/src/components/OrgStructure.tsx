import React, { useState, useEffect, useCallback } from 'react';
import { Users, ChevronRight, ChevronDown, Building2, Loader2, Plus, Edit2, Trash2, X, Search, AlertTriangle, ChevronUp, Eye, ArrowRightLeft } from 'lucide-react';
import { getDeptTree, addDept, updateDept, deleteDept, getUserList, updateUser, deleteUser } from '../services/api/auth';
import { toast } from 'sonner';

interface DeptItem { deptId: number; parentId: number; deptName: string; orderNum: number; leader: string; phone: string; email: string; status: string; ancestors?: string; children?: DeptItem[]; }
interface UserItem { userId: number; userName: string; nickName: string; email: string; phonenumber: string; sex: string; status: string; deptId: number; deptName?: string; role?: string; createTime?: string; remark?: string; }

const flattenDepts = (depts: DeptItem[], level = 0, excludeId?: number): { dept: DeptItem; level: number }[] => {
  const result: { dept: DeptItem; level: number }[] = [];
  for (const d of depts) {
    if (excludeId && d.deptId === excludeId) continue;
    result.push({ dept: d, level });
    if (d.children?.length) result.push(...flattenDepts(d.children, level + 1, excludeId));
  }
  return result;
};

const TreeSelect: React.FC<{ value: number | undefined; onChange: (v: number) => void; deptTree: DeptItem[]; excludeId?: number; showRoot?: boolean; placeholder?: string }> = ({ value, onChange, deptTree, excludeId, showRoot = true, placeholder = '请选择' }) => {
  const [open, setOpen] = useState(false);
  const flat = flattenDepts(deptTree, 0, excludeId);
  const selected = flat.find(f => f.dept.deptId === value);
  return (
    <div className="relative">
      <button type="button" className="w-full border border-slate-300 rounded-lg p-2 text-left text-sm focus:ring-2 focus:ring-pink-400 focus:outline-none flex justify-between items-center" onClick={() => setOpen(!open)}>
        <span>{selected ? selected.dept.deptName : (value === 0 && showRoot ? '顶级部门' : placeholder)}</span>
        {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>
      {open && (
        <div className="absolute z-10 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
          {showRoot && <button className={`w-full text-left px-3 py-2 text-sm hover:bg-pink-50 ${value === 0 ? 'bg-pink-50 text-pink-600 font-medium' : 'text-slate-700'}`} onClick={() => { onChange(0); setOpen(false); }}>顶级部门</button>}
          {flat.map(({ dept, level }) => (
            <button key={dept.deptId} className={`w-full text-left px-3 py-2 text-sm hover:bg-pink-50 ${value === dept.deptId ? 'bg-pink-50 text-pink-600 font-medium' : 'text-slate-700'}`} style={{ paddingLeft: `${level * 16 + 12}px` }} onClick={() => { onChange(dept.deptId); setOpen(false); }}>{dept.deptName}</button>
          ))}
        </div>
      )}
    </div>
  );
};

const DeptFormModal: React.FC<{ visible: boolean; onClose: () => void; onSubmit: (d: Partial<DeptItem>) => void; editing: DeptItem | null; deptTree: DeptItem[]; defaultParentId?: number }> = ({ visible, onClose, onSubmit, editing, deptTree, defaultParentId }) => {
  const [form, setForm] = useState<Partial<DeptItem>>({});
  useEffect(() => { setForm(editing ? { ...editing } : { parentId: defaultParentId ?? 0, orderNum: 0, status: '0' }); }, [editing, visible, defaultParentId]);
  if (!visible) return null;
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
        <div className="p-5 border-b border-slate-100 flex justify-between items-center">
          <h3 className="text-lg font-bold text-slate-800">{editing ? '编辑部门' : '新增部门'}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
        </div>
        <div className="p-5 space-y-4 max-h-[60vh] overflow-y-auto">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">上级部门</label>
            <TreeSelect value={form.parentId} onChange={v => setForm({ ...form, parentId: v })} deptTree={deptTree} excludeId={editing?.deptId} />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">部门名称 <span className="text-red-500">*</span></label>
            <input className="w-full border border-slate-300 rounded-lg p-2 focus:ring-2 focus:ring-pink-400 focus:outline-none" value={form.deptName || ''} onChange={e => setForm({ ...form, deptName: e.target.value })} placeholder="请输入部门名称" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">排序</label>
              <input type="number" className="w-full border border-slate-300 rounded-lg p-2 focus:ring-2 focus:ring-pink-400 focus:outline-none" value={form.orderNum ?? 0} onChange={e => setForm({ ...form, orderNum: parseInt(e.target.value) || 0 })} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">负责人</label>
              <input className="w-full border border-slate-300 rounded-lg p-2 focus:ring-2 focus:ring-pink-400 focus:outline-none" value={form.leader || ''} onChange={e => setForm({ ...form, leader: e.target.value })} placeholder="负责人" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">电话</label>
              <input className="w-full border border-slate-300 rounded-lg p-2 focus:ring-2 focus:ring-pink-400 focus:outline-none" value={form.phone || ''} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="电话" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">邮箱</label>
              <input className="w-full border border-slate-300 rounded-lg p-2 focus:ring-2 focus:ring-pink-400 focus:outline-none" value={form.email || ''} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="邮箱" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">状态</label>
            <div className="flex gap-4">
              {[['0', '正常'], ['1', '停用']].map(([v, l]) => (
                <label key={v} className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" checked={form.status === v} onChange={() => setForm({ ...form, status: v })} className="accent-pink-500" />
                  <span className="text-sm">{l}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
        <div className="p-5 border-t border-slate-100 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">取消</button>
          <button onClick={() => { if (!form.deptName?.trim()) { toast.error('请输入部门名称'); return; } onSubmit(form); }} className="px-4 py-2 text-sm bg-pink-500 text-white rounded-lg hover:bg-pink-600">确定</button>
        </div>
      </div>
    </div>
  );
};

const UserDetailModal: React.FC<{ visible: boolean; onClose: () => void; user: UserItem | null }> = ({ visible, onClose, user }) => {
  if (!visible || !user) return null;
  const fields = [
    { label: '用户名', value: user.userName },
    { label: '昵称', value: user.nickName },
    { label: '部门', value: user.deptName || '-' },
    { label: '角色', value: user.role || '-', isRole: true },
    { label: '手机', value: user.phonenumber || '-' },
    { label: '邮箱', value: user.email || '-' },
    { label: '性别', value: user.sex === '0' ? '男' : user.sex === '1' ? '女' : '未知' },
    { label: '状态', value: user.status === '0' ? '正常' : '停用', isStatus: true },
    { label: '备注', value: user.remark || '-' },
  ];
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="p-5 border-b border-slate-100 flex justify-between items-center">
          <h3 className="text-lg font-bold text-slate-800">用户详情</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
        </div>
        <div className="p-5">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-14 h-14 bg-pink-50 rounded-full flex items-center justify-center text-pink-600 text-xl font-bold">
              {(user.nickName || user.userName || '?')[0]}
            </div>
            <div>
              <div className="text-lg font-bold text-slate-800">{user.nickName || user.userName}</div>
              <div className="text-sm text-slate-500">ID: {user.userId}</div>
            </div>
          </div>
          <div className="space-y-3">
            {fields.map(f => (
              <div key={f.label} className="flex items-center">
                <span className="w-20 text-xs text-slate-400 flex-shrink-0">{f.label}</span>
                <span className="text-sm text-slate-800">
                  {'isRole' in f && f.isRole && f.value !== '-' ? (
                    <span className="bg-pink-50 text-pink-600 px-2 py-0.5 rounded text-xs">{f.value}</span>
                  ) : 'isStatus' in f && f.isStatus ? (
                    <span className={`text-xs px-2 py-0.5 rounded-full ${f.value === '正常' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>{f.value}</span>
                  ) : f.value}
                </span>
              </div>
            ))}
          </div>
        </div>
        <div className="p-5 border-t border-slate-100 flex justify-end">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">关闭</button>
        </div>
      </div>
    </div>
  );
};

const ChangeDeptModal: React.FC<{ visible: boolean; onClose: () => void; onSubmit: (userId: number, deptId: number) => void; user: UserItem | null; deptTree: DeptItem[] }> = ({ visible, onClose, onSubmit, user, deptTree }) => {
  const [newDeptId, setNewDeptId] = useState<number | undefined>(undefined);
  useEffect(() => { if (user) setNewDeptId(user.deptId); }, [user, visible]);
  if (!visible || !user) return null;
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
        <div className="p-5 border-b border-slate-100 flex justify-between items-center">
          <h3 className="text-lg font-bold text-slate-800">调整部门</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
        </div>
        <div className="p-5 space-y-4">
          <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
            <div className="w-10 h-10 bg-pink-50 rounded-full flex items-center justify-center text-pink-600 text-sm font-bold">
              {(user.nickName || user.userName || '?')[0]}
            </div>
            <div>
              <div className="text-sm font-medium text-slate-800">{user.nickName || user.userName}</div>
              <div className="text-xs text-slate-500">当前部门: {user.deptName || '-'}</div>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">调整至部门</label>
            <TreeSelect value={newDeptId} onChange={v => setNewDeptId(v)} deptTree={deptTree} showRoot={false} placeholder="请选择目标部门" />
          </div>
        </div>
        <div className="p-5 border-t border-slate-100 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">取消</button>
          <button onClick={() => { if (!newDeptId) { toast.error('请选择目标部门'); return; } onSubmit(user.userId, newDeptId); }} className="px-4 py-2 text-sm bg-pink-500 text-white rounded-lg hover:bg-pink-600">确认调整</button>
        </div>
      </div>
    </div>
  );
};

const ConfirmModal: React.FC<{ visible: boolean; onClose: () => void; onConfirm: () => void; title: string; msg: string }> = ({ visible, onClose, onConfirm, title, msg }) => {
  if (!visible) return null;
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center"><AlertTriangle size={20} className="text-red-600" /></div>
          <h3 className="text-lg font-bold text-slate-800">{title}</h3>
        </div>
        <p className="text-slate-600 text-sm mb-6">{msg}</p>
        <div className="flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">取消</button>
          <button onClick={onConfirm} className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700">确认删除</button>
        </div>
      </div>
    </div>
  );
};

const DeptNode: React.FC<{ dept: DeptItem; level?: number; selectedId: number | null; onSelect: (d: DeptItem) => void; onEdit: (d: DeptItem) => void; onDel: (d: DeptItem) => void; onAddChild: (d: DeptItem) => void }> = ({ dept, level = 0, selectedId, onSelect, onEdit, onDel, onAddChild }) => {
  const [exp, setExp] = useState(true);
  const has = !!(dept.children?.length);
  const sel = selectedId === dept.deptId;
  return (
    <div className="select-none">
      <div className={`group flex items-center gap-2 py-1.5 px-2 rounded cursor-pointer transition-colors ${sel ? 'bg-pink-50 text-pink-600' : 'hover:bg-slate-50 text-slate-700'}`} style={{ paddingLeft: `${level * 20 + 8}px` }}>
        <button onClick={e => { e.stopPropagation(); setExp(!exp); }} className="w-4 h-4 flex items-center justify-center">
          {has ? (exp ? <ChevronDown size={14} className="text-slate-400" /> : <ChevronRight size={14} className="text-slate-400" />) : <span className="w-3.5" />}
        </button>
        <div className="flex-1 flex items-center gap-2 min-w-0" onClick={() => onSelect(dept)}>
          <Building2 size={15} className={sel ? 'text-pink-500' : 'text-slate-400'} />
          <span className="text-sm font-medium truncate">{dept.deptName}</span>
          {dept.status === '1' && <span className="text-[10px] bg-red-100 text-red-600 px-1.5 rounded">停用</span>}
        </div>
        <div className="hidden group-hover:flex items-center gap-0.5">
          <button onClick={e => { e.stopPropagation(); onAddChild(dept); }} className="p-1 rounded hover:bg-pink-50 text-slate-400 hover:text-pink-500" title="新增子部门"><Plus size={13} /></button>
          <button onClick={e => { e.stopPropagation(); onEdit(dept); }} className="p-1 rounded hover:bg-amber-100 text-slate-400 hover:text-amber-600" title="编辑"><Edit2 size={13} /></button>
          <button onClick={e => { e.stopPropagation(); onDel(dept); }} className="p-1 rounded hover:bg-red-100 text-slate-400 hover:text-red-600" title="删除"><Trash2 size={13} /></button>
        </div>
      </div>
      {exp && has && <div>{dept.children!.map(c => <DeptNode key={c.deptId} dept={c} level={level + 1} selectedId={selectedId} onSelect={onSelect} onEdit={onEdit} onDel={onDel} onAddChild={onAddChild} />)}</div>}
    </div>
  );
};

export const OrgStructure = () => {
  const [deptTree, setDeptTree] = useState<DeptItem[]>([]);
  const [deptLoading, setDeptLoading] = useState(true);
  const [selDept, setSelDept] = useState<DeptItem | null>(null);
  const [deptFormVis, setDeptFormVis] = useState(false);
  const [editDept, setEditDept] = useState<DeptItem | null>(null);
  const [delDeptVis, setDelDeptVis] = useState(false);
  const [delDept, setDelDept] = useState<DeptItem | null>(null);
  const [defaultParentId, setDefaultParentId] = useState<number>(0);
  const [users, setUsers] = useState<UserItem[]>([]);
  const [userLoading, setUserLoading] = useState(false);
  const [userSearch, setUserSearch] = useState('');
  const [detailUser, setDetailUser] = useState<UserItem | null>(null);
  const [changeDeptUser, setChangeDeptUser] = useState<UserItem | null>(null);
  const [delUserVis, setDelUserVis] = useState(false);
  const [delUser, setDelUser] = useState<UserItem | null>(null);

  const countDepts = (ds: DeptItem[]): number => ds.reduce((n, d) => n + 1 + (d.children ? countDepts(d.children) : 0), 0);

  const fetchDepts = useCallback(async () => {
    setDeptLoading(true);
    try { const r: any = await getDeptTree(); setDeptTree(Array.isArray(r) ? r : []); } catch { /* */ } finally { setDeptLoading(false); }
  }, []);

  const fetchUsers = useCallback(async (deptId?: number) => {
    setUserLoading(true);
    try { const r: any = await getUserList(deptId ? { deptId } : {}); setUsers(Array.isArray(r) ? r : (r?.rows || r?.records || [])); } catch { setUsers([]); } finally { setUserLoading(false); }
  }, []);

  useEffect(() => { fetchDepts(); }, [fetchDepts]);
  useEffect(() => { fetchUsers(selDept?.deptId); }, [selDept, fetchUsers]);

  const handleDeptSubmit = async (data: Partial<DeptItem>) => {
    try {
      if (data.deptId) { await updateDept(data); toast.success('部门更新成功'); }
      else { await addDept(data); toast.success('部门创建成功'); }
      setDeptFormVis(false); fetchDepts();
    } catch (e: any) { toast.error(e?.message || '操作失败'); }
  };

  const handleDeptDelete = async () => {
    if (!delDept) return;
    try { await deleteDept(delDept.deptId); toast.success('部门删除成功'); setDelDeptVis(false); setDelDept(null); if (selDept?.deptId === delDept.deptId) setSelDept(null); fetchDepts(); }
    catch (e: any) { toast.error(e?.message || '删除失败'); }
  };

  const handleChangeDept = async (userId: number, deptId: number) => {
    try {
      await updateUser({ userId, deptId });
      toast.success('部门调整成功');
      setChangeDeptUser(null);
      fetchUsers(selDept?.deptId);
    } catch (e: any) { toast.error(e?.message || '调整失败'); }
  };

  const handleUserDelete = async () => {
    if (!delUser) return;
    try {
      await deleteUser([delUser.userId]);
      toast.success('用户删除成功');
      setDelUserVis(false); setDelUser(null);
      fetchUsers(selDept?.deptId);
    } catch (e: any) { toast.error(e?.message || '删除失败'); }
  };

  const filteredUsers = users.filter(u => !userSearch || u.nickName?.includes(userSearch) || u.userName?.includes(userSearch) || u.email?.includes(userSearch));

  return (
    <div className="flex h-full gap-6">
      <div className="w-80 bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col shadow-sm flex-shrink-0">
        <div className="p-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
          <h3 className="font-bold text-slate-800 flex items-center gap-2"><Users size={18} className="text-pink-500" /> 组织架构</h3>
          <button onClick={() => { setEditDept(null); setDefaultParentId(0); setDeptFormVis(true); }} className="p-1.5 rounded-lg hover:bg-pink-50 text-pink-500" title="新增部门"><Plus size={18} /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {deptLoading ? (
            <div className="flex justify-center items-center h-40 text-slate-400"><Loader2 className="animate-spin mr-2" /> 加载中...</div>
          ) : deptTree.length === 0 ? (
            <div className="text-center text-slate-400 py-10 text-sm">暂无部门数据</div>
          ) : (
            deptTree.map(d => <DeptNode key={d.deptId} dept={d} selectedId={selDept?.deptId ?? null} onSelect={dept => setSelDept(prev => prev?.deptId === dept.deptId ? null : dept)} onEdit={dept => { setEditDept(dept); setDeptFormVis(true); }} onDel={dept => { setDelDept(dept); setDelDeptVis(true); }} onAddChild={dept => { setEditDept(null); setDefaultParentId(dept.deptId); setDeptFormVis(true); }} />)
          )}
        </div>
        <div className="p-3 border-t border-slate-100 bg-slate-50 text-xs text-slate-500 flex justify-between">
          <span>部门总数: {countDepts(deptTree)}</span>
          <span>当前人员: {filteredUsers.length}</span>
        </div>
      </div>

      <div className="flex-1 bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col shadow-sm">
        <div className="p-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center gap-4">
          <div className="flex items-center gap-3">
            <h3 className="font-bold text-slate-800">{selDept ? selDept.deptName : '全部人员'}</h3>
            <span className="text-xs bg-pink-50 text-pink-600 px-2 py-0.5 rounded-full">{filteredUsers.length} 人</span>
          </div>
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input className="pl-9 pr-3 py-1.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-pink-400 focus:outline-none w-48" placeholder="搜索用户..." value={userSearch} onChange={e => setUserSearch(e.target.value)} />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {userLoading ? (
            <div className="flex justify-center items-center h-40 text-slate-400"><Loader2 className="animate-spin mr-2" /> 加载中...</div>
          ) : filteredUsers.length === 0 ? (
            <div className="text-center text-slate-400 py-16 text-sm">{userSearch ? '未找到匹配用户' : (selDept ? '该部门暂无用户' : '暂无用户数据')}</div>
          ) : (
            <table className="w-full">
              <thead className="bg-slate-50 sticky top-0">
                <tr className="text-left text-xs text-slate-500 uppercase">
                  <th className="px-4 py-3 font-medium">用户</th>
                  <th className="px-4 py-3 font-medium">用户名</th>
                  <th className="px-4 py-3 font-medium">部门</th>
                  <th className="px-4 py-3 font-medium">手机</th>
                  <th className="px-4 py-3 font-medium">角色</th>
                  <th className="px-4 py-3 font-medium">状态</th>
                  <th className="px-4 py-3 font-medium text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredUsers.map(u => (
                  <tr key={u.userId} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-pink-50 rounded-full flex items-center justify-center text-pink-600 text-sm font-bold">{(u.nickName || u.userName || '?')[0]}</div>
                        <div>
                          <div className="text-sm font-medium text-slate-800">{u.nickName || '-'}</div>
                          {u.email && <div className="text-xs text-slate-400">{u.email}</div>}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600">{u.userName}</td>
                    <td className="px-4 py-3 text-sm text-slate-600">{u.deptName || '-'}</td>
                    <td className="px-4 py-3 text-sm text-slate-600">{u.phonenumber || '-'}</td>
                    <td className="px-4 py-3 text-sm text-slate-600">
                      {u.role ? <span className="bg-pink-50 text-pink-600 px-2 py-0.5 rounded text-xs">{u.role}</span> : '-'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${u.status === '0' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>{u.status === '0' ? '正常' : '停用'}</span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => setDetailUser(u)} className="p-1.5 rounded hover:bg-pink-50 text-slate-400 hover:text-pink-500 mr-1" title="查看详情"><Eye size={14} /></button>
                      <button onClick={() => setChangeDeptUser(u)} className="p-1.5 rounded hover:bg-amber-100 text-slate-400 hover:text-amber-600 mr-1" title="调整部门"><ArrowRightLeft size={14} /></button>
                      <button onClick={() => { setDelUser(u); setDelUserVis(true); }} className="p-1.5 rounded hover:bg-red-100 text-slate-400 hover:text-red-600" title="删除"><Trash2 size={14} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <DeptFormModal visible={deptFormVis} onClose={() => setDeptFormVis(false)} onSubmit={handleDeptSubmit} editing={editDept} deptTree={deptTree} defaultParentId={defaultParentId} />
      <ConfirmModal visible={delDeptVis} onClose={() => setDelDeptVis(false)} onConfirm={handleDeptDelete} title="删除部门" msg={`确定要删除部门「${delDept?.deptName}」吗？此操作不可恢复。`} />
      <UserDetailModal visible={!!detailUser} onClose={() => setDetailUser(null)} user={detailUser} />
      <ChangeDeptModal visible={!!changeDeptUser} onClose={() => setChangeDeptUser(null)} onSubmit={handleChangeDept} user={changeDeptUser} deptTree={deptTree} />
      <ConfirmModal visible={delUserVis} onClose={() => setDelUserVis(false)} onConfirm={handleUserDelete} title="删除用户" msg={`确定要删除用户「${delUser?.nickName || delUser?.userName}」吗？此操作不可恢复。`} />
    </div>
  );
};
