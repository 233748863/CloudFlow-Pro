import request from "../request";
import { getRoleOptions } from "../auth";
import type { RoleInfo, UserBrief } from "@/types/workflow";
import { extractList, logApiCall } from "./internals";

/**
 * 获取用户列表（用于选择审批人等）
 * Gateway route: /auth/** → cloudflow-auth (StripPrefix=1)
 */
export async function getUsers(): Promise<UserBrief[]> {
  logApiCall("GET", "/auth/system/user/list");
  return request.get("/auth/system/user/list").then((response) =>
    extractList<Record<string, any>>(response).map((user) => ({
      id: String(user.id ?? user.userId ?? ""),
      name: String(user.name ?? user.nickName ?? user.userName ?? ""),
      email: user.email,
      avatar: user.avatar,
      deptId: user.deptId ? String(user.deptId) : undefined,
      deptName: user.deptName ?? user.dept?.deptName,
    })).filter((user) => user.id && user.name),
  );
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
