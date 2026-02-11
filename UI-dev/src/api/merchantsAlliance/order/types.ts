// 订单列表查询参数
export interface OrderListRequest {
  page?: number // 当前页码
  pageSize?: number // 每页数量
  userId?: number //用户ID
  storeId?: number //门店ID
  status?: string //订单状态
  orderNo?: string //订单号
  createdStart?: string //创建时间开始
  createdEnd?: string //创建时间结束
}

// 订单列表项
export interface OrderListItem {
  id: number // 订单ID
  orderNo: string // 订单号
  userId: number // 用户ID
  storeId: number // 门店ID
  storeName: string // 门店名称
  status: string // 订单状态：1-待支付，2-支付中，3-已支付，4-已核销，5-已完成，6-已取消，7-退款中，8-已退款
  statusDesc: string // 订单状态描述
  orderAmount: number // 订单总金额(元)
  discountAmount: number // 优惠金额(元)
  payAmount: number // 实付金额(元)
  payMethod: string // 支付方式：1-微信支付
  payMethodDesc: string // 支付方式描述
  payTime: string // 支付时间
  verifyCode: string // 核销码
  verifyTime: string // 核销时间
  remark: string // 订单备注
  createTime: string // 创建时间
  updateTime: string // 修改时间
}

// 订单列表响应
export interface OrderListResponse {
  total: number // 总记录数
  size: number // 每页数量
  current: number // 当前页码
  records: OrderListItem[] // 订单列表项
}

// 订单商品项
export interface GoodsItem {
  id: number // 订单商品ID
  productSkuId: number // SKU ID
  productName: string // 商品名称
  skuSpec: string // SKU规格
  productImage: string // 商品图片
  quantity: number // 数量
  originalPrice: number // SKU单价(元)
  discountAmount: number // 分摊优惠(元)
  payAmount: number // 实付金额(元)
}

// 订单配送地址项
export interface DeliveryAddress {
  id: number // 地址ID
  receiverName: string // 收货人姓名
  receiverPhone: string // 收货人手机号
  province: string // 省
  city: string // 市
  district: string // 区/县
  detailAddress: string // 详细地址
  latitude: number // 纬度
  longitude: number // 经度
}

// 订单配送记录项
export interface DeliveryRecord {
  id: number // 配送记录ID
  channel: string // 配送渠道
  provider: string // 服务商编码/名称
  trackingNo: string // 运单号/配送单号
  status: string // 配送状态代码
  statusDesc: string // 配送状态描述
  deliveryPersonName: string // 配送员姓名
  deliveryPersonPhone: string // 配送员联系方式
  estimatePickTime: string // 预计取件时间
  estimateArrivalTime: string // 预计送达时间
  actualPickTime: string // 实际取件时间
  deliveredTime: string // 送达完成时间
  remark: string // 配送备注
}

// 订单详情响应
export interface OrderDetail {
  id: number // 订单ID
  orderNo: string // 订单号
  userId: number // 用户ID
  storeId: number // 门店ID
  storeName: string // 门店名称
  status: string // 订单状态：1-待支付，2-支付中，3-已支付，4-已核销，5-已完成，6-已取消，7-退款中，8-已退款
  statusDesc: string // 订单状态描述
  orderAmount: number // 订单总金额(元)
  discountAmount: number // 优惠金额(元)
  payAmount: number // 实付金额(元)
  payMethod: string // 支付方式：1-微信支付
  payMethodDesc: string // 支付方式描述
  payTime: string // 支付时间
  verifyCode: string // 核销码
  verifyTime: string // 核销时间
  remark: string // 订单备注
  items: GoodsItem[] // 订单商品列表
  deliveryAddress: DeliveryAddress // 配送地址
  deliveryRecord: DeliveryRecord // 配送记录
  createTime: string // 创建时间
  updateTime: string // 修改时间
}

// 订单配送请求参数
export interface DeliveryRequest {
  orderId: number // 订单ID
  deliveryPersonName: string // 配送员姓名
  deliveryPersonPhone: string // 配送员联系方式
}

// 订单配送地址更新请求参数
export interface AddressUpdateRequest {
  orderId: number // 订单ID
  receiverName: string // 收货人姓名
  receiverPhone: string // 收货人手机号
  province: string // 省
  city: string // 市
  district: string // 区/县
  detailAddress: string // 详细地址
  latitude?: number // 纬度
  longitude?: number // 经度
}

// 订单退款审核请求参数
export interface RefundAuditRequest {
  refundApplyId: string // 退款申请ID
  approved: boolean // 审核状态：1-同意，2-拒绝
  auditRemark: string // 审核备注
}

// 订单退款列表请求参数
export interface RefundListRequest {
  /** 页码 */
  current: number
  /** 每页数量 */
  size: number
  /** 订单ID */
  orderId: string
  /** 订单号 */
  orderNo: string
  /** 退款申请号 */
  refundNo: string
  /** 退款状态 */
  status: string
  /** 退款类型 */
  refundType: string
  /** 开始时间 */
  startTime: string
  /** 结束时间 */
  endTime: string
}

// 订单退款列表项
export interface RefundOrderItem {
  /** 退款申请ID */
  id: string
  /** 订单ID */
  orderId: string
  /** 订单号 */
  orderNo: string
  /** 退款申请号 */
  refundNo: string
  /** 退款类型 */
  refundType: string
  /** 退款金额 */
  refundAmount: string
  /** 退款原因 */
  refundReason: string
  /** 退款状态 */
  status: string
  /** 退款状态描述 */
  statusDescription: string
  /** 审核备注 */
  auditRemark: string
  /** 审核时间 */
  auditTime: string
  /** 退款时间 */
  refundTime: string
  /** 创建时间 */
  createdTime: string
  /** 更新时间 */
  updatedTime: string
}

// 订单退款列表响应参数
export interface RefundListResponse {
  /** 总记录数 */
  total: number
  /** 每页数量 */
  size: number
  /** 当前页码 */
  current: number
  /** 总页数 */
  pages: number
  /** 订单退款列表项 */
  records: RefundOrderItem[]
}

// 订单退款详情商品项
export interface RefundItems {
  /** 商品项ID */
  id: string
  /** 退款申请ID */
  refundApplyId: string
  /** 订单商品项ID */
  orderItemId: string
  /** 商品ID */
  productId: string
  /** 商品SKU ID */
  productSkuId: string
  /** 商品名称 */
  productName: string
  /** 商品图片 */
  productImage: string
  /** 商品规格 */
  skuSpec: string
  /** 单价 */
  unitPrice: number
  /** 订单商品数量 */
  quantity: number
  /** 退款商品数量 */
  refundQuantity: number
  /** 退款金额 */
  refundAmount: number
}

// 订单商品项
export interface OrderItems {
  /** 订单ID */
  orderId: string
  /** 订单商品项ID */
  id: string
  /** 商品SKU ID */
  productSkuId: string
  /** 商品ID */
  productId: string
  /** 商品SKU 编码 */
  skuCode: string
  /** 商品名称 */
  productName: string
  /** 商品规格 */
  skuSpec: string
  /** 商品图片 */
  productImage: string
  /** 订单商品数量 */
  quantity: number
  /** 商品原价 */
  originalPrice: number
  /** 优惠金额 */
  discountAmount: number
  /** 商品实付金额 */
  payAmount: number
}

// 订单退款详情数据
export interface RefundDetailData {
  /** 退款申请ID */
  id: string
  /** 订单ID */
  orderId: string
  /** 订单号 */
  orderNo: string
  /** 退款申请号 */
  refundNo: string
  /** 退款类型 */
  refundType: string
  /** 退款类型描述 */
  refundTypeDesc: string
  /** 退款金额 */
  refundAmount: number
  /** 订单已支付金额 */
  orderPaidAmount: number
  /** 退款原因 */
  refundReason: string
  /** 退款状态 */
  status: string
  /** 退款状态描述 */
  statusDesc: string
  /** 申请退款用户ID */
  applicantId: number
  /** 申请退款用户名 */
  applicantName: string
  /** 申请退款用户手机号 */
  applicantPhone: string
  /** 审核退款用户ID */
  reviewerId: number
  /** 审核退款用户名 */
  reviewerName: string
  /** 审核退款用户备注 */
  reviewRemark: string
  /** 审核退款时间 */
  reviewTime: string
  /** 退款时间 */
  refundTime: string
  /** 创建时间 */
  createdTime: string
  /** 订单退款详情商品项 */
  refundItems: RefundItems[]
  /** 订单商品项 */
  orderItems: OrderItems[]
}
