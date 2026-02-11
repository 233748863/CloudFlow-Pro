import request from './request';

// ================= 考勤管理 =================

export interface AttendanceRecord {
  recordId?: number;
  userId?: number;
  type: '1' | '2'; // 1: 签到, 2: 签退
  checkTime?: string;
  location?: string;
  address?: string;
  deviceInfo?: string;
  wifiInfo?: string;
  status?: string; // 1: 正常, 2: 迟到, 3: 早退, ...
  remark?: string;
}

export interface AttendanceRule {
  ruleId: number;
  ruleName: string;
  checkInTime: string;
  checkOutTime: string;
  elasticMinutes: number;
  locationPoints?: string;
  wifiConfigs?: string;
  radius?: number;
}

// 打卡
export const checkIn = (data: AttendanceRecord) => {
  return request.post<boolean>('/oa/attendance/checkin', data);
};

// 获取当前规则
export const getAttendanceRule = () => {
  return request.get<AttendanceRule>('/oa/attendance/rule');
};

// ================= 资产管理 =================

export interface Asset {
  assetId?: number;
  assetCode?: string;
  name: string;
  category?: string;
  model?: string;
  status?: string; // 1: 闲置, 2: 在用, 3: 维修, 4: 报废
  price?: number;
  purchaseDate?: string;
  ownerId?: number;
  location?: string;
  remark?: string;
  createBy?: string;
  createTime?: string;
}

// 资产变动日志
export interface AssetLog {
  logId?: number;
  refId?: number;
  refType?: string;
  type?: string;
  quantityChange?: number;
  operatorId?: number;
  targetId?: number;
  remark?: string;
  createTime?: string;
}

// 资产查询参数
export interface AssetQueryParams {
  pageNum?: number;
  pageSize?: number;
  name?: string;
  assetCode?: string;
  category?: string;
  status?: string;
}

// 资产统计数据
export interface AssetStatistics {
  total: number;
  statusCount: {
    idle: number;
    inUse: number;
    repair: number;
    scrapped: number;
  };
  categoryCount: Record<string, number>;
  totalValue: number;
  categoryValue: Record<string, number>;
}

// 分页查询资产列表
export const getAssetList = (params?: AssetQueryParams) => {
  return request.get('/oa/asset/list', { params });
};

// 获取资产详情
export const getAssetDetail = (id: number) => {
  return request.get<Asset>(`/oa/asset/${id}`);
};

// 新增资产
export const addAsset = (data: Asset) => {
  return request.post<boolean>('/oa/asset', data);
};

// 编辑资产
export const updateAsset = (data: Asset) => {
  return request.put<boolean>('/oa/asset', data);
};

// 删除资产
export const deleteAsset = (id: number) => {
  return request.delete<boolean>(`/oa/asset/${id}`);
};

// 资产领用
export const borrowAsset = (id: number, userId: number) => {
  return request.post(`/oa/asset/${id}/borrow`, null, { params: { userId } });
};

// 资产归还
export const returnAsset = (id: number) => {
  return request.post(`/oa/asset/${id}/return`);
};

// 资产送修
export const repairAsset = (id: number, remark?: string) => {
  return request.post(`/oa/asset/${id}/repair`, null, { params: { remark } });
};

// 资产报废
export const scrapAsset = (id: number, remark?: string) => {
  return request.post(`/oa/asset/${id}/scrap`, null, { params: { remark } });
};

// 获取资产变动日志
export const getAssetLogs = (id: number) => {
  return request.get<AssetLog[]>(`/oa/asset/${id}/logs`);
};

// 获取资产统计
export const getAssetStatistics = () => {
  return request.get<AssetStatistics>('/oa/asset/statistics');
};

// 获取所有分类列表
export const getAssetCategories = () => {
  return request.get<string[]>('/oa/asset/categories');
};

// 获取二维码 URL
export const getAssetQrCodeUrl = (id: number) => {
  return `/dev-api/oa/asset/${id}/qrcode`;
};
