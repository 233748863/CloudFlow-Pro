<template>
  <el-drawer v-model="state.showAuditDrawer" direction="rtl" header-class="mb-0" size="70%" title="订单详情" resizable>
    <template #header>
      <span class="font-bold">订单详情</span>
    </template>
    <div v-if="state.loading" v-loading="state.loading" class="my-10" element-loading-text="加载中..."></div>
    <div v-else>
      <el-card>
        <template v-slot:header>
          <div class="flex justify-between items-center">
            <div class="text-lg font-bold">订单编号：{{ orderDetail?.orderNo }}</div>
            <div class="text-lg font-bold">订单创建时间：{{ orderDetail?.createTime }}</div>
          </div>
        </template>
        <div v-if="orderDetail?.verifyCode">核销码：{{ orderDetail?.verifyCode }}</div>
        <div v-if="orderDetail?.verifyTime">核销时间：{{ orderDetail?.verifyTime }}</div>
        <div>订单状态：{{ orderDetail?.statusDesc }}</div>
        <div class="flex justify-center items-center mb-2">
          <div class="text-lg font-bold">商品列表</div>
        </div>
        <el-table :data="orderDetail?.items" style="width: 100%" border show-summary>
          <el-table-column label="商品名称" prop="productName" width="200" />
          <el-table-column label="商品图片" width="110">
            <template #default="scope">
              <el-image
                :preview-src-list="[getImageUrl(scope.row.productImage)]"
                :preview-teleported="true"
                :src="getImageUrl(scope.row.productImage)"
                alt="商品图片"
                fit="cover"
                style="width: 80px; height: 80px"
              />
            </template>
          </el-table-column>
          <el-table-column label="规格" prop="skuSpec" />
          <el-table-column label="数量" prop="quantity" width="120" sortable />
          <el-table-column label="单价" prop="originalPrice" width="120" sortable />
          <el-table-column label="优惠金额" prop="discountAmount" width="120" sortable />
          <el-table-column label="实付金额" prop="payAmount" width="120" sortable />
        </el-table>
        <div class="flex justify-end items-center my-2 gap-8">
          <div class="text-lg font-bold">订单金额：￥{{ orderDetail?.orderAmount }}</div>
          <div class="text-lg font-bold">实付金额：￥{{ orderDetail?.payAmount }}</div>
        </div>
        <!--        支付信息-->
        <el-divider />
        <div class="mb-4">
          <div class="text-2xl font-bold">支付信息</div>
        </div>
        <div class="grid grid-cols-2 gap-4 items-center">
          <div class="text-lg font-bold">支付方式：{{ orderDetail?.payMethodDesc }}</div>
          <div class="text-lg font-bold">支付状态：{{ orderDetail?.statusDesc }}</div>
          <!--          <div v-else class="text-lg font-bold">支付状态：已支付</div>-->
        </div>
        <!--        收货信息-->
        <div v-if="orderDetail?.deliveryAddress">
          <!--        <div>-->
          <el-divider />
          <div class="mb-4">
            <div class="text-2xl font-bold">收货地址</div>
          </div>
          <div class="grid gap-4">
            <div class="grid grid-cols-2 gap-4 items-center">
              <div>
                <span class="text-lg font-bold">收货人：</span>
                <span>{{ orderDetail?.deliveryAddress?.receiverName || '无' }}</span>
              </div>
              <div>
                <span class="text-lg font-bold">收货人手机号：</span>
                <span>{{ orderDetail?.deliveryAddress?.receiverPhone || '无' }}</span>
              </div>
            </div>
            <div>
              <span class="text-lg font-bold">收货人地址：</span>
              <span>
                {{ orderDetail?.deliveryAddress?.province || '' }}
              </span>
              <span v-if="orderDetail?.deliveryAddress?.province !== orderDetail?.deliveryAddress?.city">
                {{ orderDetail?.deliveryAddress?.city || '' }}
              </span>
              <span>
                {{ orderDetail?.deliveryAddress?.district || '' }}
              </span>
              <span>
                {{ orderDetail?.deliveryAddress?.detailAddress || '' }}
              </span>
            </div>
          </div>
        </div>
        <!--        配送信息-->
        <div v-if="orderDetail?.deliveryRecord">
          <!--        <div>-->
          <el-divider />
          <div class="mb-4">
            <div class="text-2xl font-bold">配送信息</div>
          </div>
          <div class="grid gap-4">
            <div class="grid grid-cols-2 gap-4 items-center">
              <div>
                <span class="text-lg font-bold">配送单号：</span>
                <span class="text-lg font-bold">{{ orderDetail?.deliveryRecord?.trackingNo || '无' }}</span>
              </div>
              <div>
                <span class="text-lg font-bold">配送状态：</span>
                <span>{{ orderDetail?.deliveryRecord?.statusDesc || '无' }}</span>
              </div>
              <div>
                <span class="text-lg font-bold">服务商编码/名称：</span>
                <span>{{ orderDetail?.deliveryRecord?.provider || '无' }}</span>
              </div>
              <div>
                <span class="text-lg font-bold">配送渠道：</span>
                <span>{{ orderDetail?.deliveryRecord?.channel || '无' }}</span>
              </div>
              <div>
                <span class="text-lg font-bold">配送员：</span>
                <span>{{ orderDetail?.deliveryRecord?.deliveryPersonName || '无' }}</span>
              </div>
              <div>
                <span class="text-lg font-bold">配送员手机号：</span>
                <span>{{ orderDetail?.deliveryRecord?.deliveryPersonPhone || '无' }}</span>
              </div>
              <div v-if="orderDetail?.deliveryRecord?.actualPickTime">
                <span class="text-lg font-bold">取件时间：</span>
                <span>{{ orderDetail?.deliveryRecord?.actualPickTime || '无' }}</span>
              </div>
              <div v-else>
                <span class="text-lg font-bold">预计取件时间：</span>
                <span>{{ orderDetail?.deliveryRecord?.estimatePickTime || '无' }}</span>
              </div>
              <div v-if="orderDetail?.deliveryRecord?.deliveredTime">
                <span class="text-lg font-bold">送达时间：</span>
                <span>{{ orderDetail?.deliveryRecord?.deliveredTime || '无' }}</span>
              </div>
              <div v-else>
                <span class="text-lg font-bold">预计送达时间：</span>
                <span>{{ orderDetail?.deliveryRecord?.estimateArrivalTime || '无' }}</span>
              </div>
            </div>
            <div>
              <span class="text-lg font-bold">配送备注：</span>
              <span>{{ orderDetail?.deliveryRecord?.remark || '无' }}</span>
            </div>
          </div>
        </div>
      </el-card>
    </div>
  </el-drawer>
</template>

<script setup lang="ts">
import { getOrderDetail } from '/@/api/merchantsAlliance/order'
import { OrderDetail } from '/@/api/merchantsAlliance/order/types'
import { ElMessage } from 'element-plus'
import { getImageUrl } from '/@/views/merchantsAlliance/way'

const props = defineProps({
  orderId: {
    type: Number,
    default: undefined,
  },
  isShow: {
    type: Boolean,
    default: false,
  },
})
// 定义事件
const emits = defineEmits(['error', 'update:isShow'])
// 订单详情
const orderDetail = ref<OrderDetail>()
// 状态管理
const state = reactive({
  loading: false,
  showAuditDrawer: false,
})

// 获取订单详情
async function getOrderDetailData(orderId: number) {
  state.loading = true
  try {
    const res = await getOrderDetail(orderId)
    if (res.code === 0) {
      orderDetail.value = res.data
    }
  } catch (error) {
    state.showAuditDrawer = false
    ElMessage.error('获取订单详情失败')
    emits('error', false)
  } finally {
    state.loading = false
  }
}

// 监听isShow变化
watch(
  () => props.isShow,
  (newVal) => {
    if (newVal && props.orderId) {
      state.showAuditDrawer = true
      getOrderDetailData(props.orderId)
    } else if (newVal) {
      state.showAuditDrawer = false
      ElMessage.error('获取订单详情失败')
      emits('error', false)
    }
  }
)
// 监听showAuditDrawer变化
watch(
  () => state.showAuditDrawer,
  (newVal) => {
    if (!newVal) {
      emits('update:isShow', false)
    }
  }
)
</script>

<style scoped lang="scss">
:deep(.cell) {
  text-align: center;
}
</style>
