import request from "../request";
import { getRoleOptions } from "../auth";
import type { RoleInfo, UserBrief } from "@/types/workflow";
import { logApiCall } from "./internals";

/**
 * 获取用户列表（用于选择审批人等）
 * Gateway route: /auth/** → cloudflow-auth (StripPrefix=1)
 */
export async function getUsers(): Promise<UserBrief[]> {
  logApiCall("GET", "/auth/system/user/options");
  const users: UserBrief[] = [];
  let pageNum = 1;
  let total = 1;
  while (users.length < total) {
    const response = await request.get<{ rows: { userId: number; nickName: string; deptId?: number; deptName?: string }[]; total: number }>("/auth/system/user/options", { params: { pageNum, pageSize: 100 } });
    if (!response.rows.length) break;
    users.push(...response.rows.map(user => ({ id: String(user.userId), name: user.nickName,
      deptId: user.deptId ? String(user.deptId) : undefined, deptName: user.deptName })));
    total = response.total;
    pageNum++;
  }
  return users;
}

/**
 * 获取角色列表
 * Gateway route: /auth/** → cloudflow-auth (StripPrefix=1)
 */
export async function getRoles(): Promise<RoleInfo[]> {
  logApiCall("GET", "/auth/system/role/optionselect");
  const roles = await getRoleOptions();
  return roles.map((role) => ({
    id: String(role.roleId),
    name: role.roleName,
    code: role.roleKey,
    key: role.roleKey,
    roleKey: role.roleKey,
  }));
}
