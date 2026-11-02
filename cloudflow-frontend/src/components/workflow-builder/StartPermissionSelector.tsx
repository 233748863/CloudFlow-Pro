import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { getDeptTree, getRoleOptions, getUserList, SysDept, SysUser } from '@/services/api/auth';
import { getErrorMessage } from '@/utils/errorMessage';
import { CandidateChipItem, CandidateChipList } from './CandidateChipList';
import { flattenDeptTree, readApproverCache, writeApproverCache } from './helpers';

type PermissionType = 'ROLE' | 'USER' | 'DEPT';

interface StartPermissionSelectorProps {
  type: PermissionType;
  value: string;
  onChange: (value: string) => void;
}

const labels = { ROLE: '角色', USER: '人员', DEPT: '部门' };

export const StartPermissionSelector = ({ type, value, onChange }: StartPermissionSelectorProps) => {
  const [items, setItems] = useState<CandidateChipItem[]>([]);
  const [loading, setLoading] = useState(false);
  const selectedValues: string[] = JSON.parse(value || '[]');

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        let options = readApproverCache(type);
        if (!options) {
          options = type === 'ROLE'
            ? await getRoleOptions()
            : type === 'USER'
              ? await getUserList() as SysUser[]
              : flattenDeptTree(await getDeptTree() as SysDept[]);
          writeApproverCache(type, options);
        }
        const next = options.map((item) => {
          const id = String(type === 'ROLE' ? item.roleId : type === 'USER' ? item.userId : item.deptId);
          return {
            id,
            value: id,
            label: type === 'ROLE' ? item.roleName : type === 'USER' ? item.nickName || item.userName : item.deptName,
            caption: type === 'ROLE' ? item.roleKey : type === 'USER' ? item.userName : undefined,
          };
        });
        if (!cancelled) setItems(next);
      } catch (error) {
        if (!cancelled) toast.error(getErrorMessage(error, '加载启动权限选项失败'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [type]);

  return (
    <CandidateChipList
      title={`选择${labels[type]}`}
      multiple
      loading={loading}
      searchPlaceholder={`搜索${labels[type]}...`}
      items={items}
      selectedValues={selectedValues}
      onToggle={(id) => onChange(JSON.stringify(
        selectedValues.includes(id) ? selectedValues.filter((value) => value !== id) : [...selectedValues, id],
      ))}
    />
  );
};
