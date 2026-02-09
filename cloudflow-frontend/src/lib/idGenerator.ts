/**
 * 统一的 ID 生成策略
 * 使用 crypto.randomUUID() 生成符合 RFC 4122 标准的 UUID
 */

/**
 * 生成唯一的 UUID
 * @returns UUID 字符串
 */
export function generateId(): string {
  return crypto.randomUUID();
}

/**
 * 生成带前缀的 ID
 * @param prefix 前缀字符串
 * @returns 带前缀的 ID
 */
export function generatePrefixedId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}

/**
 * 生成短 ID（用于临时标识）
 * @returns 8位短 ID
 */
export function generateShortId(): string {
  return crypto.randomUUID().split('-')[0];
}

/**
 * 检查 ID 是否为临时 ID（以 new_ 或 temp_ 开头）
 * @param id 要检查的 ID
 * @returns 是否为临时 ID
 */
export function isTemporaryId(id: string): boolean {
  return id.startsWith('new_') || id.startsWith('temp_');
}

/**
 * 生成工作流节点 ID
 * @returns 节点 ID
 */
export function generateNodeId(): string {
  return generatePrefixedId('node');
}

/**
 * 生成表单字段 ID
 * @returns 字段 ID
 */
export function generateFieldId(): string {
  return generatePrefixedId('field');
}

/**
 * 生成任务 ID
 * @returns 任务 ID
 */
export function generateTaskId(): string {
  return generatePrefixedId('task');
}
