// 目标类型
export const TARGET_TYPES = {
  NOTICE: '公告',
  COUPON: '优惠券',
  PRODUCT: '商品',
  STORE: '门店',
  MERCHANT: '商家',
  INDUSTRY: '行业',
}

// 路由路径
export const ROUTE_PATH = {
  NOTICE: '/notice',
  COUPON: '/pages-coupon/detail?couponTemplateId=',
  PRODUCT: '/product',
  STORE: '/pages-member/merchant/store?merchantId=',
  MERCHANT: '/pages-member/merchant/index',
  INDUSTRY: '/industry',
} as Record<string, string>

// 预定义颜色
export const PREDEFINE_COLORS = [
  '#ff4500',
  '#ff8c00',
  '#ffd700',
  '#90ee90',
  '#00ced1',
  '#1e90ff',
  '#c71585',
  'rgba(255, 69, 0, 0.68)',
  'rgb(255, 120, 0)',
  'hsv(51, 100, 98)',
  'hsva(120, 40, 94, 0.5)',
  'hsl(181, 100%, 37%)',
  'hsla(209, 100%, 56%, 0.73)',
  '#c7158577',
]

// 平台banner查询请求参数
export interface PlatformBannerRequest {
  /** 页码 */
  pageNum?: number
  /** 每页数量 */
  pageSize?: number
  /** 图片名称 */
  imageName?: string
  /** 目标类型 */
  targetTypes?: string[]
  /** 是否启用 */
  enable?: boolean
  /** 是否按权重排序 */
  orderByWeight?: boolean
  /** 是否按创建时间排序 */
  orderByCreatedTime?: boolean
  /** 开始时间 */
  startDate?: string
  /** 结束时间 */
  endDate?: string
}

export interface BannerData {
  /** 主键 */
  id: string
  /** 图片名称 */
  imageName?: string
  /** 摘要 */
  summary?: string
  /** 图片url */
  imageUrl?: string
  /** 路由路径 */
  routePath?: string
  /** 目标类型 */
  targetType?: string
  /** 目标ID */
  targetId?: string
  /** 背景颜色 */
  bgColor?: string
  /** 排序权重 */
  sortWeight?: number
  /** 是否启用 */
  enable?: boolean
  /** 显示开始时间 */
  showStartTime?: string
  /** 显示结束时间 */
  showEndTime?: string
  /** 是否编辑 */
  isEdit?: boolean
}

// 平台banner查询响应参数
export interface PlatformBannerResponse {
  current: number
  size: number
  total: number
  records: BannerData[]
}

// 平台导航菜单查询请求参数
export interface PlatformNaviMenuRequest {
  /** 页码 */
  pageNum?: number
  /** 每页数量 */
  pageSize?: number
  /** 菜单名称 */
  name?: string
  /** 菜单类型 */
  type?: string
  /** 菜单深度 */
  depth?: number
  /** 商家ID */
  merchantId?: string
  /** 是否启用 */
  enable?: boolean
  /** 是否按权重排序 */
  sortByWeight?: boolean
  /** 是否按深度排序 */
  sortByDepth?: boolean
  /** 是否按创建时间排序 */
  sortByCreatedTime?: boolean
}

// 平台导航菜单
export interface PlatformNaviMenuData {
  /** 主键 */
  id?: string
  /** 菜单名称 */
  name?: string
  /** 父菜单ID */
  parentId?: string
  /** 父菜单名称 */
  parentName?: string
  /** 菜单深度 */
  depth?: number
  /** 菜单类型 */
  type?: string
  /** 目标ID */
  targetId?: string
  /** 图片URL */
  imageUrl?: string
  /** 排序权重 */
  sortWeight?: number
  /** 是否启用 */
  enable?: boolean
  /** 创建时间 */
  createdTime?: string
  /** 是否平台菜单 */
  platform?: boolean
  /** 是否编辑 */
  isEdit?: boolean
  /** 临时ID */
  tempId?: string
}

// 平台导航菜单查询响应参数
export interface PlatformNaviMenuResponse {
  current: number
  size: number
  total: number
  records: PlatformNaviMenuData[]
}

// 小程序导航菜单查询响应参数
export interface PlatformNaviMenuTreeResponse {
  id: string,
  name: string,
  targetId: number,
  imageUrl: string,
  child: {}
}