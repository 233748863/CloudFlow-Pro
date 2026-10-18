import { getCurrentUserSnapshot } from '@/utils/authStorage';

export const consumableOperationStorageKey = (scope: string) => {
  const user = getCurrentUserSnapshot();
  if (!user) throw new Error('请登录后操作耗材');
  const userId = user.id ?? user.userId;
  if (!/^[1-9]\d*$/.test(String(user.tenantId)) || !/^[1-9]\d*$/.test(String(userId))) throw new Error('当前用户或租户信息不完整，未发送耗材请求');
  return `oa08:pending:${user.tenantId}:${userId}:${scope}`;
};

export function readConsumableOperation<Command>(key: string): Command | null {
  const stored = sessionStorage.getItem(key);
  return stored ? JSON.parse(stored) as Command : null;
}

export function freezeConsumableOperation<Command extends { operationKey: string }>(key: string, command: Command): Command {
  const previous = readConsumableOperation<Command>(key);
  if (previous) return previous;
  const serialized = JSON.stringify(command);
  sessionStorage.setItem(key, serialized);
  return JSON.parse(serialized) as Command;
}

export const newConsumableOperationKey = () => crypto.randomUUID();

export function completeConsumableOperation(key: string) {
  sessionStorage.removeItem(key);
}
