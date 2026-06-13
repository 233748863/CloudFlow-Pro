type AnnouncementDateInput = string | Date | null | undefined;

function getRawDateText(value: AnnouncementDateInput) {
  if (typeof value === 'string' && value.trim()) {
    return value.trim();
  }
  return '刚刚';
}

function parseAnnouncementDate(value: AnnouncementDateInput) {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}

/**
 * 公告时间展示兼容层：
 * 输出“相对时间”或“相对时间 + 详细时间”的统一格式。
 */
export function formatAnnouncementRelativeTime(value: AnnouncementDateInput) {
  const date = parseAnnouncementDate(value);
  if (!date) {
    return getRawDateText(value);
  }

  const diffMs = Date.now() - date.getTime();
  if (diffMs < 0) {
    return '刚刚';
  }

  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffDays > 0) {
    return `${diffDays} 天前`;
  }
  if (diffHours > 0) {
    return `${diffHours} 小时前`;
  }
  if (diffMinutes > 0) {
    return `${diffMinutes} 分钟前`;
  }
  return '刚刚';
}

export function formatAnnouncementDateTime(value: AnnouncementDateInput) {
  const date = parseAnnouncementDate(value);
  if (!date) {
    return getRawDateText(value);
  }

  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

export function formatAnnouncementRelativeWithDateTime(value: AnnouncementDateInput) {
  const relativeTime = formatAnnouncementRelativeTime(value);
  const dateTime = formatAnnouncementDateTime(value);

  if (!dateTime || dateTime === relativeTime) {
    return relativeTime;
  }

  return `${relativeTime} · ${dateTime}`;
}
