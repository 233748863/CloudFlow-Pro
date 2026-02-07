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
  status?: string; // 1: 闲置, 2: 在用, ...
  price?: number;
  purchaseDate?: string;
  ownerId?: number;
  location?: string;
  remark?: string;
}

// 获取资产列表
export const getAssetList = () => {
  return request.get<Asset[]>('/oa/asset/list');
};

// 新增资产
export const addAsset = (data: Asset) => {
  return request.post<boolean>('/oa/asset', data);
};

// 获取二维码 (直接返回图片流 URL)
export const getAssetQrCodeUrl = (id: number) => {
  // 注意：这里返回的是 URL，需要在 img src 中使用
  // 需要根据后端 BaseURL 拼接，或者在组件中直接拼接
  return `/dev-api/oa/asset/${id}/qrcode`; 
};
