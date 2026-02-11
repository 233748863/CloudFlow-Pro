import request from '/@/utils/request'
import {
  AddressUpdateRequest,
  DeliveryRequest,
  OrderListRequest,
  RefundAuditRequest, RefundDetailData, RefundListRequest, RefundListResponse,
} from '/@/api/merchantsAlliance/order/types'

enum OrderApi {
  // 订单列表
  List = '/merchant/order/page',
  // 订单详情
  Detail = '/merchant/order/detail/{orderId}',
  // 新增订单
  Create = '/merchant/order/create',
  // 订单核销
  Verify = '/merchant/order/verify/{orderId}',
  // 订单配送
  Delivery = '/merchant/order/delivery/local/start',
  // 订单配送地址更新
  AddressUpdate = '/merchant/order/address/update',
  // 订单退款审核
  RefundAudit = '/merchant/order/refund/audit',
  // 订单退款列表
  RefundList = '/merchant/order/refund/page',
  // 订单退款详情
  RefundDetail = '/merchant/order/refund/detail/{refundApplyId}',
}

// 订单列表
export function getOrderList(query: OrderListRequest) {
  return request({
    url: OrderApi.List,
    method: 'post',
    data: query,
  })
}

// 订单详情
export function getOrderDetail(orderId: number) {
  return request({
    url: OrderApi.Detail.replace('{orderId}', orderId.toString()),
    method: 'get',
  })
}

// 新增订单
export function createOrder(query: any) {
  return request({
    url: OrderApi.Create,
    method: 'post',
    data: query,
  })
}

// 订单核销
export function verifyOrder(orderId: number, verifyCode: string) {
  return request({
    url: OrderApi.Verify.replace('{orderId}', orderId.toString()),
    method: 'post',
    data: {
      verifyCode: verifyCode,
    },
  })
}

// 订单配送
export function deliveryOrder(query: DeliveryRequest) {
  return request({
    url: OrderApi.Delivery,
    method: 'post',
    data: query,
  })
}

// 订单配送地址更新
export function addressUpdate(query: AddressUpdateRequest) {
  return request({
    url: OrderApi.AddressUpdate,
    method: 'post',
    data: query,
  })
}

// 订单退款审核
export function refundAudit(query: RefundAuditRequest) {
  return request({
    url: OrderApi.RefundAudit,
    method: 'post',
    data: query,
  })
}

// 订单退款列表
export function getRefundList(query: RefundListRequest) {
  return request<RefundListResponse>({
    url: OrderApi.RefundList,
    method: 'post',
    data: query,
  })
}

// 订单退款详情
export function getRefundDetail(refundApplyId: string) {
  return request<RefundDetailData>({
    url: OrderApi.RefundDetail.replace('{refundApplyId}', refundApplyId.toString()),
    method: 'get',
  })
}
