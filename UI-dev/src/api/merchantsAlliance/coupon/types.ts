export interface IGoodsPageParams {
  merchantId: string
  keyword?: string
  page: number
  pageNum: number
  pageSize?: number
}

export interface IMerchantPageParams {
  enable: boolean
  name?: string
  page: number
  pageSize?: number
  businessStatus: Array<string>
}

export interface ISku {
  id?: string
  skuId: string
  skuName: string
  categoryName?: string
  price: number
  skuImage: string
  attributes: {
    [key: string]: any
  }
}

export interface IMerchant {
  id: string
  merchantName: string
}

export interface IStore {
  id: string
  name: string
  address: string
}

export interface ICouponForm {
  name: string
  summary: string
  description: string
  logoUrl: string
  type: string
  scope: string
  discountAmount?: number | null
  discountRate?: number | null
  minSpendAmount: number | string
  maxDeductibleAmount?: number
  totalQuantity: number
  validityType: string
  validStartTime: string
  validEndTime: string
  validRangeTime?: string[]
  validDaysFromReceive?: number
  receiveLimitPerUser: number
  rebateRate: number
  merchantId: string // 假设Session.getTenant()返回string类型
  storeIds: string[]
  skuIds: string[]
  merchants: string[]
  couponStatus: string | null
}

export interface IDict {
  value: string
  desc: string
}

export interface IStoreResp {
  id: string
  storeName: string
  storeAddress: string
}

export interface ICoupon {
  couponTemplateId: string
  name: string
  summary: string
  description: string
  logoUrl: string
  type: IDict
  scope: IDict
  discountAmount?: number | null
  discountRate?: number | null
  minSpendAmount: number | string
  maxDeductibleAmount: number
  totalQuantity: number
  validityType: IDict
  validStartTime: string
  validEndTime: string
  validRangeTime: string[]
  validDaysFromReceive: number
  receiveLimitPerUser: number
  rebateRate: number
  merchantId: string // 假设Session.getTenant()返回string类型
  storeIds: string[]
  skuIds: string[]
  merchants: string[]
  couponStatus: IDict
  createTime: string
  usedCount?: number
  availableStores: IStoreResp[]
  availableSkus: ISku[]
  applicableMerchants: string[]
}
