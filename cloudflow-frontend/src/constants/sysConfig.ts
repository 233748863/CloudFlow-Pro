export const SYS_UPLOAD_MAX_FILE_SIZE = 'sys.upload.maxFileSize';
export const SYS_UPLOAD_ALLOWED_TYPES = 'sys.upload.allowedTypes';

export const CONFIG_SCOPE_GLOBAL = '0';
export const CONFIG_SCOPE_TENANT = '1';

export const CONFIG_SCOPE_MAP: Record<string, string> = {
  [SYS_UPLOAD_MAX_FILE_SIZE]: CONFIG_SCOPE_GLOBAL,
  [SYS_UPLOAD_ALLOWED_TYPES]: CONFIG_SCOPE_GLOBAL,
};
