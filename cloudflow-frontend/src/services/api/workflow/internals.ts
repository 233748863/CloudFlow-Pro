/**
 * 从 PageResult 或数组中提取列表
 * 兼容后端返回的不同格式
 */
export function extractList<T = any>(res: unknown): T[] {
  if (res && typeof res === "object") {
    const obj = res as Record<string, unknown>;
    if (Array.isArray(obj.records)) {
      return obj.records as T[];
    }
    if (Array.isArray(obj.rows)) {
      return obj.rows as T[];
    }
  }
  if (Array.isArray(res)) {
    return res as T[];
  }
  return [] as T[];
}

export function extractPageMeta(res: unknown): {
  total: number | null;
  pageNum: number | null;
  pageSize: number | null;
} {
  if (!res || typeof res !== "object" || Array.isArray(res)) {
    return { total: null, pageNum: null, pageSize: null };
  }

  const obj = res as Record<string, unknown>;
  const toNumber = (value: unknown) => {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === "string" && value.trim() !== "") {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
  };

  return {
    total: toNumber(obj.total),
    pageNum: toNumber(obj.pageNum ?? obj.current),
    pageSize: toNumber(obj.pageSize ?? obj.size),
  };
}

/**
 * 开发环境日志记录
 */
export function logApiCall(method: string, endpoint: string, data?: any) {
  if (import.meta.env.DEV) {
    console.log(`[API] ${method} ${endpoint}`, data || "");
  }
}

/**
 * 归档时间参数标准化：
 * 日期输入（yyyy-MM-dd）自动扩展为当天边界时间，便于后端按时间段精确筛选。
 */
export function normalizeArchiveDateTime(value: string, isEnd: boolean): string {
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return `${trimmed} ${isEnd ? "23:59:59" : "00:00:00"}`;
  }
  return trimmed;
}
