/**
 * 日期格式化工具
 * 统一前端发送到后端的日期格式为 "yyyy-MM-dd HH:mm:ss"
 * 后端 @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") 要求此格式
 */

/**
 * 将 Date 对象或日期字符串转为后端要求的格式 "yyyy-MM-dd HH:mm:ss"（本地时间）
 * 用于 POST/PUT 请求体中的日期字段
 */
export const toBackendDateString = (dateInput: string | Date): string => {
  const d = typeof dateInput === 'string' && dateInput.includes(' ') && !dateInput.includes('T')
    ? new Date(dateInput.replace(' ', 'T'))
    : new Date(dateInput);
  if (isNaN(d.getTime())) return '';
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const seconds = String(d.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
};

/**
 * 将 Date 对象或日期字符串转为 datetime-local 输入框所需的本地时间格式 (YYYY-MM-DDTHH:mm)
 * 用于 <input type="datetime-local"> 的 value 属性
 */
export const toLocalDatetimeString = (dateInput: string | Date): string => {
  const d = typeof dateInput === 'string' && dateInput.includes(' ') && !dateInput.includes('T')
    ? new Date(dateInput.replace(' ', 'T'))
    : new Date(dateInput);
  if (isNaN(d.getTime())) return '';
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
};

/**
 * 将 Date 对象转为 "yyyy-MM-dd HH:mm:ss" 格式（本地时间）
 * 用于 GET 请求的查询参数
 */
export const toQueryDateString = (date: Date): string => {
  return toBackendDateString(date);
};

/**
 * 解析后端返回的日期字符串为 Date 对象
 * 支持 "yyyy-MM-dd HH:mm:ss" 和 ISO 8601 格式
 * 用于前端显示时解析后端返回的日期
 */
export const parseBackendDate = (dateStr: string): Date => {
  if (!dateStr) return new Date(NaN);
  // 将 "yyyy-MM-dd HH:mm:ss" 转为 "yyyy-MM-ddTHH:mm:ss" 以便正确解析
  const normalized = dateStr.includes(' ') && !dateStr.includes('T')
    ? dateStr.replace(' ', 'T')
    : dateStr;
  return new Date(normalized);
};

const formatDateParts = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
};

export const formatDateTimeDisplay = (value?: string | Date | null): string => {
  if (!value) return '-';

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? '-' : formatDateParts(value);
  }

  const text = String(value).trim();
  if (!text) return '-';

  const localMatch = text.match(
    /^(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?)?$/,
  );
  if (localMatch) {
    const [, date, hour = '00', minute = '00', second = '00'] = localMatch;
    return `${date} ${hour}:${minute}:${second}`;
  }

  const parsed = parseBackendDate(text);
  if (Number.isNaN(parsed.getTime())) {
    return text;
  }

  return formatDateParts(parsed);
};
