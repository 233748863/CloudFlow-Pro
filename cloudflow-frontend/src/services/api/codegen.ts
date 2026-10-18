import request from './request';

export interface PageResult<T> {
  rows: T[];
  total: number;
  pageNum: number;
  pageSize: number;
}

export interface DbTable {
  tableName: string;
  tableComment?: string;
  createTime?: string;
  updateTime?: string;
}

export interface CodegenTable {
  tableId?: number;
  tableName: string;
  tableComment?: string;
  moduleName: string;
  businessName: string;
  className: string;
  functionName: string;
  packageName: string;
  author?: string;
  tplCategory: string;
  parentMenuId?: number | null;
  subTableName?: string | null;
  subTableFk?: string | null;
  treeParentCode?: string | null;
  treeNameCode?: string | null;
  tenantFieldFlag: number;
  logicDeleteFlag: number;
  versionFieldFlag: number;
  remark?: string;
  updateTime?: string;
}

export interface CodegenColumn {
  columnId?: number;
  tableId?: number;
  columnName: string;
  columnComment?: string;
  columnType: string;
  javaType: string;
  javaField: string;
  pkFlag: number;
  incrementFlag: number;
  requiredFlag: number;
  insertFlag: number;
  editFlag: number;
  listFlag: number;
  queryFlag: number;
  queryType: string;
  htmlType: string;
  dictType?: string | null;
  auditFieldFlag: number;
  sortNo: number;
}

export interface CodegenDetail {
  table: CodegenTable;
  columns: CodegenColumn[];
}

export interface CodegenOptions {
  modules: string[];
  templateCategories: string[];
  queryTypes: string[];
  htmlTypes: string[];
  javaTypes: string[];
}

export interface CodegenWriteResult {
  written: string[];
  skipped: string[];
  overwritten: string[];
}

const basePath = '/auth/system/codegen';

export const pageDatabaseTables = (params: {
  tableName?: string;
  tableComment?: string;
  pageNum: number;
  pageSize: number;
}) => request.get<PageResult<DbTable>>(`${basePath}/db/list`, { params });

export const pageCodegenTables = (params: {
  tableName?: string;
  functionName?: string;
  moduleName?: string;
  pageNum: number;
  pageSize: number;
}) => request.get<PageResult<CodegenTable>>(`${basePath}/list`, { params });

export const getCodegenOptions = () => request.get<CodegenOptions>(`${basePath}/options`);

export const getCodegenDetail = (tableId: number) =>
  request.get<CodegenDetail>(`${basePath}/${tableId}`);

export const importCodegenTables = (tableNames: string[], moduleName: string) =>
  request.post<void>(`${basePath}/import`, { tableNames, moduleName });

export const saveCodegenConfiguration = (detail: CodegenDetail) =>
  request.put<void>(basePath, detail);

export const syncCodegenTable = (tableId: number) =>
  request.post<void>(`${basePath}/${tableId}/sync`);

export const previewCodegenTable = (tableId: number) =>
  request.get<Record<string, string>>(`${basePath}/${tableId}/preview`);

export const downloadCodegenTable = (tableId: number) =>
  request.get<Blob>(`${basePath}/${tableId}/download`, { responseType: 'blob' });

export const writeCodegenTable = (
  tableId: number,
  targetRoot: string,
  confirmOverwrite: boolean,
) => request.post<CodegenWriteResult>(`${basePath}/${tableId}/write`, {
  targetRoot,
  confirmOverwrite,
});

export const removeCodegenTables = (tableIds: number[]) =>
  request.delete<void>(`${basePath}/${tableIds.join(',')}`);
