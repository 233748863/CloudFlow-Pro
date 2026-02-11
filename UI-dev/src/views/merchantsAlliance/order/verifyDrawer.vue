<template>
  <el-drawer v-model="state.showAuditDrawer" direction="rtl" header-class="mb-0" size="70%" title="订单处理" resizable>
    <template #header>
      <span class="font-bold">订单核销</span>
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
                :src="
                  getImageUrl(scope.row.productImage)
                "
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
      </el-card>
    </div>
    <template #footer>
      <el-button type="danger" @click="state.showAuditDrawer = false">关闭</el-button>
      <el-button :v-auth="'merchant_order_verify'" type="primary" @click="handleVerify">核销订单</el-button>
    </template>
  </el-drawer>
</template>

<script setup lang="ts">
import { getOrderDetail, verifyOrder } from '/@/api/merchantsAlliance/order'
import { OrderDetail } from '/@/api/merchantsAlliance/order/types'
import { ElMessage, ElMessageBox } from 'element-plus'
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
const emits = defineEmits(['error', 'success', 'update:isShow'])
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

// 核销订单
async function handleVerify() {
  await ElMessageBox.confirm('核销前请确认订单详情，确定要核销订单吗？', '操作确认', {
    confirmButtonText: '确定',
    cancelButtonText: '取消',
    type: 'warning',
  })
  if (!orderDetail.value?.verifyCode) {
    ElMessage.error('请先获取核销码')
    return
  }
  try {
    if (!props.orderId) {
      ElMessage.error('订单ID不能为空')
      return
    }
    const res = await verifyOrder(props.orderId, orderDetail.value.verifyCode)
    if (res.code === 0) {
      state.showAuditDrawer = false
      ElMessage.success('订单核销成功')
      emits('update:isShow', false)
      emits('success', true)
    }
  } catch (error) {
    ElMessage.error('订单核销失败')
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

<style scoped lang="scss"></style>
