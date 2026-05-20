export const ATTACHMENT_ACCESS_PREFIX = '/api/auth/system/file/access?path=';

const ACCESS_PATH_MARKERS = ['/api/auth/system/file/access?path=', '/auth/system/file/access?path='];

const stripQueryAndHash = (value: string) => {
  const queryIndex = value.indexOf('?');
  const hashIndex = value.indexOf('#');
  const endIndex = [queryIndex, hashIndex].filter((index) => index >= 0).sort((a, b) => a - b)[0];
  return endIndex == null ? value : value.slice(0, endIndex);
};

const decodeSafe = (value: string) => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

const extractAccessReference = (value: string) => {
  const marker = ACCESS_PATH_MARKERS.find((item) => value.includes(item));
  if (!marker) {
    return value;
  }
  const encoded = value.slice(value.indexOf(marker) + marker.length);
  return decodeSafe(encoded);
};

const stripStorageSuffix = (fileName: string) => {
  const underscoreIndex = fileName.lastIndexOf('_');
  const dotIndex = fileName.lastIndexOf('.');
  if (underscoreIndex > 0 && dotIndex > underscoreIndex) {
    return `${fileName.slice(0, underscoreIndex)}${fileName.slice(dotIndex)}`;
  }
  return fileName;
};

export const normalizeAttachmentUrl = (value?: string | null) => {
  const raw = String(value || '').trim();
  if (!raw) {
    return '';
  }
  if (ACCESS_PATH_MARKERS.some((marker) => raw.includes(marker))) {
    return raw.startsWith('/auth/') ? `/api${raw}` : raw;
  }
  return `${ATTACHMENT_ACCESS_PREFIX}${encodeURIComponent(raw)}`;
};

export const normalizeAttachmentUrls = (value?: string | string[] | null) => {
  const list = Array.isArray(value)
    ? value
    : String(value || '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  return list.map((item) => normalizeAttachmentUrl(item)).filter(Boolean);
};

export const getAttachmentRawValue = (value?: string | null) => {
  const raw = String(value || '').trim();
  if (!raw) {
    return '';
  }
  return extractAccessReference(raw);
};

export const getAttachmentDisplayName = (value?: string | null) => {
  const raw = getAttachmentRawValue(value);
  if (!raw) {
    return '附件';
  }
  const normalized = stripQueryAndHash(raw);
  const lastSegment = normalized.split('/').filter(Boolean).pop() || normalized;
  return decodeSafe(stripStorageSuffix(lastSegment)) || '附件';
};

export const isAttachmentImage = (value?: string | null) => {
  const fileName = getAttachmentDisplayName(value).toLowerCase();
  return /\.(jpg|jpeg|png|gif|webp|bmp|svg)$/.test(fileName);
};
