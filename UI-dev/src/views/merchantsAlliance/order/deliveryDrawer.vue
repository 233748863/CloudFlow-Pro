<template>
  <el-drawer v-model="state.showAuditDrawer" direction="rtl" header-class="mb-0" size="70%" title="订单处理" resizable>
    <template #header>
      <span class="font-bold">订单发货</span>
    </template>
    <el-card>
      <template v-slot:header>
        <div class="flex justify-between items-center">
          <div class="text-lg font-bold">订单编号：{{ orderDetail?.orderNo }}</div>
          <div class="text-lg font-bold">订单创建时间：{{ orderDetail?.createTime }}</div>
        </div>
      </template>
      <div v-if="state.loading" v-loading="state.loading" class="my-10" element-loading-text="加载中..."></div>
      <div v-else>
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
      </div>
    </el-card>
    <el-card class="mt-4">
      <template v-slot:header>
        <div class="flex items-center justify-between">
          <div class="text-lg font-bold">发货信息</div>
          <el-select v-model="state.status" placeholder="请选择配送方式" style="width: 200px">
            <el-option v-for="(item, index) in order_type" :key="index" :label="item.label" :value="item.value" />
          </el-select>
        </div>
      </template>
      <el-form
        v-if="state.status === 'DELIVERY'"
        ref="deliveryFormRef"
        :model="state.deliveryForm"
        :rules="state.deliveryRules"
        class="mt-4"
      >
        <el-form-item label="配送员" prop="deliveryPersonName">
          <el-input v-model="state.deliveryForm.deliveryPersonName" placeholder="请输入配送员姓名" />
        </el-form-item>
        <el-form-item label="手机号" prop="deliveryPersonPhone">
          <el-input v-model="state.deliveryForm.deliveryPersonPhone" placeholder="请输入配送员手机号" />
        </el-form-item>
        <!--        收货信息-->
        <div v-if="orderDetail?.deliveryAddress">
          <!--                  <div>-->
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
      </el-form>
    </el-card>
    <template #footer>
      <el-button type="danger" @click="state.showAuditDrawer = false">关闭</el-button>
      <el-button :v-auth="'merchant_order_verify'" type="primary" @click="handleDelivery">发货</el-button>
    </template>
  </el-drawer>
</template>

<script setup lang="ts">
import { deliveryOrder, getOrderDetail } from '/@/api/merchantsAlliance/order'
import { OrderDetail } from '/@/api/merchantsAlliance/order/types'
import { ElMessage } from 'element-plus'
import { auth } from '/@/utils/authFunction'
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
// 发货表单引用
const deliveryFormRef = ref<any>(null)
// 配送方式
const order_type = [
  {
    value: 'DELIVERY',
    label: '配送',
  },
  {
    value: 'PICKUP',
    label: '自提',
  },
]

// 发货表单
const state = reactive({
  loading: false,
  showAuditDrawer: false,
  // 配送方式
  status: 'DELIVERY',
  deliveryForm: {
    deliveryPersonName: '',
    deliveryPersonPhone: '',
  },
  deliveryRules: {
    deliveryPersonName: [{ required: true, message: '请输入配送员姓名', trigger: 'blur' }],
    deliveryPersonPhone: [{ required: true, message: '请输入配送员手机号', trigger: 'blur' }],
  },
})

// 获取订单详情
async function getOrderDetailData(orderId: number) {
  state.loading = true
  try {
    if (!auth('merchant_order_view')) {
      ElMessage.error('您没有权限查看订单详情')
      emits('error', false)
      return
    }
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

// 处理发货
async function handleDelivery() {
  if (!auth('merchant_order_update')) {
    ElMessage.error('您没有权限发货订单')
    return
  }
  // 校验表单

  if (state.status === 'DELIVERY') {
    // 配送
    try {
      if (!props.orderId) {
        ElMessage.error('订单ID不能为空')
        return
      }
      await deliveryFormRef.value.validate()
      const res = await deliveryOrder({
        orderId: props.orderId,
        ...state.deliveryForm,
      })
      if (res.code === 0) {
        ElMessage.success('发货成功')
        emits('update:isShow', false)
        emits('success', true)
      }
    } catch (error) {
      ElMessage.error('发货失败')
    }
  } else {
    // 自提
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
