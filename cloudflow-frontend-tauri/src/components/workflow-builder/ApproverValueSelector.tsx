import { useState, useEffect, useMemo } from "react";
import { getRoleOptions, getUserList, getDeptTree } from "../../services/api/auth";
import {
  CandidateChipItem,
  CandidateChipList,
} from "./CandidateChipList";
import {
  flattenDeptTree,
  readApproverCache,
  writeApproverCache,
} from "./helpers";

interface ApproverValueSelectorProps {
  type: string;
  value: string;
  onChange: (val: string) => void;
  onLabelChange?: (label: string) => void;
  multiple?: boolean;
}

// 角色/用户/部门选择器子组件 - 支持多选
export const ApproverValueSelector = ({
  type,
  value,
  onChange,
  onLabelChange,
  multiple = false,
}: ApproverValueSelectorProps) => {
  const [roles, setRoles] = useState<any[]>(
    () => readApproverCache("ROLE") || [],
  );
  const [users, setUsers] = useState<any[]>(
    () => readApproverCache("USER") || [],
  );
  const [depts, setDepts] = useState<any[]>(
    () => readApproverCache("DEPT") || [],
  );
  const [loading, setLoading] = useState(false);

  // 加载数据（优先命中本地缓存，miss 时请求后写回）
  useEffect(() => {
    let cancelled = false;

    const loadData = async () => {
      try {
        if (type === "ROLE") {
          const cached = readApproverCache("ROLE");
          if (cached) {
            if (!cancelled) setRoles(cached);
            return;
          }
          setLoading(true);
          const res: any = await getRoleOptions();
          const next = Array.isArray(res) ? res : res?.data || res?.rows || [];
          writeApproverCache("ROLE", next);
          if (!cancelled) setRoles(next);
        } else if (type === "USER") {
          const cached = readApproverCache("USER");
          if (cached) {
            if (!cancelled) setUsers(cached);
            return;
          }
          setLoading(true);
          const res: any = await getUserList();
          const next = Array.isArray(res) ? res : res?.data || res?.rows || [];
          writeApproverCache("USER", next);
          if (!cancelled) setUsers(next);
        } else if (type === "DEPT") {
          const cached = readApproverCache("DEPT");
          if (cached) {
            if (!cancelled) setDepts(cached);
            return;
          }
          setLoading(true);
          const res: any = await getDeptTree();
          const tree = Array.isArray(res) ? res : res?.data || [];
          const next = flattenDeptTree(tree);
          writeApproverCache("DEPT", next);
          if (!cancelled) setDepts(next);
        }
      } catch (e) {
        console.error("加载选项数据失败:", e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    if (type === "ROLE" || type === "USER" || type === "DEPT") {
      loadData();
    }

    return () => {
      cancelled = true;
    };
  }, [type]);

  // 当前已选值数组
  const selectedValues = value
    ? value
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean)
    : [];

  // 当前类型对应的候选项 (memo 化避免每次 render 重新映射)
  const items: CandidateChipItem[] = useMemo(() => {
    if (type === "ROLE") {
      return roles.map((r) => ({
        id: String(r.roleId),
        value: r.roleKey,
        label: r.roleName || r.roleKey,
        caption: r.roleKey,
      }));
    }
    if (type === "USER") {
      return users.map((u) => ({
        id: String(u.userId),
        value: String(u.userId),
        label: u.nickName || u.userName,
        caption: u.userName,
      }));
    }
    if (type === "DEPT") {
      return depts.map((d) => ({
        id: String(d.deptId),
        value: String(d.deptId),
        label: d.deptName,
      }));
    }
    return [];
  }, [type, roles, users, depts]);

  // 根据 value 数组反查 label (含已选但已不在候选列表的兜底回显)
  const getDisplayLabel = (vals: string[]): string => {
    return vals
      .map((v) => items.find((it) => it.value === v)?.label || v)
      .join(", ");
  };

  // 切换选中
  const toggleValue = (val: string) => {
    if (multiple) {
      const newValues = selectedValues.includes(val)
        ? selectedValues.filter((v) => v !== val)
        : [...selectedValues, val];
      onChange(newValues.join(","));
      onLabelChange?.(getDisplayLabel(newValues));
    } else {
      const newVal = val === value ? "" : val;
      onChange(newVal);
      onLabelChange?.(newVal ? getDisplayLabel([newVal]) : "");
    }
  };

  if (type === "ROLE") {
    return (
      <CandidateChipList
        title="选择角色"
        multiple={multiple}
        loading={loading}
        searchPlaceholder="搜索角色..."
        items={items}
        selectedValues={selectedValues}
        onToggle={toggleValue}
        emptyText="暂无角色数据"
      />
    );
  }

  if (type === "USER") {
    return (
      <CandidateChipList
        title="选择人员"
        multiple={multiple}
        loading={loading}
        searchPlaceholder="搜索人员..."
        alwaysShowSearch
        items={items}
        selectedValues={selectedValues}
        onToggle={toggleValue}
        emptyText="暂无人员数据"
      />
    );
  }

  if (type === "DEPT") {
    return (
      <CandidateChipList
        title="选择部门"
        multiple={multiple}
        loading={loading}
        searchPlaceholder="搜索部门..."
        items={items}
        selectedValues={selectedValues}
        onToggle={toggleValue}
        emptyText="暂无部门数据"
      />
    );
  }

  return null;
};
