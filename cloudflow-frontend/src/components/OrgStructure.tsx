
import React, { useState, useEffect } from 'react';
import { Department, User } from '../types';
import { Users, ChevronRight, ChevronDown, User as UserIcon, Building2, Loader2 } from 'lucide-react';
import { getDeptTree } from '../services/api/auth';
import { useMount } from '@/hooks/useMount';

const mapBackendDeptToFrontend = (d: any): Department => ({
  id: String(d.deptId),
  name: d.deptName,
  parentId: String(d.parentId),
  managerId: d.leader,
  children: d.children ? d.children.map(mapBackendDeptToFrontend) : []
});

const DeptNode: React.FC<{ dept: Department, level?: number }> = ({ dept, level = 0 }) => {
  const [expanded, setExpanded] = useState(true);

  return (
    <div className="select-none">
      <div 
        className="flex items-center gap-2 py-2 px-2 hover:bg-slate-50 rounded cursor-pointer transition-colors"
        style={{ paddingLeft: `${level * 20 + 8}px` }}
        onClick={() => setExpanded(!expanded)}
      >
        {dept.children && dept.children.length > 0 ? (
          expanded ? <ChevronDown size={14} className="text-slate-400"/> : <ChevronRight size={14} className="text-slate-400"/>
        ) : <span className="w-3.5" />}
        
        <Building2 size={16} className="text-indigo-600" />
        <span className="text-sm font-medium text-slate-700">{dept.name}</span>
        {dept.managerId && <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 rounded ml-2">负责人: {dept.managerId}</span>}
      </div>
      
      {expanded && dept.children && (
        <div>
          {dept.children.map(child => <DeptNode key={child.id} dept={child} level={level + 1} />)}
        </div>
      )}
    </div>
  );
};

export const OrgStructure = () => {
  const [deptTree, setDeptTree] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);

  useMount(() => {
    getDeptTree().then((res: any) => {
        if(Array.isArray(res)) {
            setDeptTree(res.map(mapBackendDeptToFrontend));
        }
    }).catch(err => console.error("Failed to load dept tree", err))
      .finally(() => setLoading(false));
  });

  return (
    <div className="flex h-full gap-6">
      <div className="w-80 bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col shadow-sm">
        <div className="p-4 border-b border-slate-100 bg-slate-50">
          <h3 className="font-bold text-slate-800 flex items-center gap-2">
            <Users size={18} className="text-indigo-600"/> 组织架构树
          </h3>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
           {loading ? (
             <div className="flex justify-center items-center h-40 text-slate-400">
               <Loader2 className="animate-spin mr-2"/> 加载中...
             </div>
           ) : (
             deptTree.map(dept => <DeptNode key={dept.id} dept={dept} />)
           )}
        </div>
      </div>

      <div className="flex-1 bg-white border border-slate-200 rounded-xl p-8 flex flex-col items-center justify-center text-center shadow-sm">
        <div className="w-16 h-16 bg-indigo-50 rounded-full flex items-center justify-center mb-4">
           <UserIcon size={32} className="text-indigo-600"/>
        </div>
        <h2 className="text-xl font-bold text-slate-800">人员管理面板</h2>
        <p className="text-slate-500 max-w-md mt-2">
          此处集成企业通讯录。在工作流中选择“直属上级”或“部门经理”时，系统将基于此树状结构进行递归查找。
        </p>
        <div className="mt-8 grid grid-cols-2 gap-4 w-full max-w-lg">
           <div className="p-4 border border-slate-100 rounded bg-slate-50">
              <div className="text-2xl font-bold text-slate-800">128</div>
              <div className="text-xs text-slate-500">在职员工</div>
           </div>
           <div className="p-4 border border-slate-100 rounded bg-slate-50">
              <div className="text-2xl font-bold text-slate-800">12</div>
              <div className="text-xs text-slate-500">部门总数</div>
           </div>
        </div>
      </div>
    </div>
  );
};
