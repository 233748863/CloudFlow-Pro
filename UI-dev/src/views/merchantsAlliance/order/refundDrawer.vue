<template>
  <el-drawer
    v-model="state.showAuditDrawer"
    :resizable="true"
    direction="rtl"
    header-class="mb-0"
    size="70%"
    title="订单处理"
  >
    <template #header>
      <span class="font-bold">订单退款</span>
    </template>
    <div v-if="state.loading" v-loading="state.loading" class="my-10" element-loading-text="加载中..."></div>
    <div v-else class="flex flex-col gap-4">
      <el-card>
        <template v-slot:header>
          <div class="text-2xl font-bold">退款信息</div>
        </template>
        <div class="grid grid-cols-2 gap-4 items-center">
          <div class="text-lg font-bold">
            退款申请时间：
            <span class="text-l font-[500]">{{ state.refundDetail?.refundTime }}</span>
          </div>
          <div class="text-lg font-bold">
            退款原因：
            <span class="text-l font-[500]">{{ state.refundDetail?.refundReason }}</span>
          </div>
          <div class="text-lg font-bold">
            顾客昵称：
            <span class="text-l font-[500]">{{ state.refundDetail?.applicantName }}</span>
          </div>
          <div class="text-lg font-bold">
            顾客手机号：
            <span class="text-l font-[500]">{{ state.refundDetail?.applicantPhone }}</span>
          </div>
          <div class="text-lg font-bold">
            退款类型：
            <span class="text-l font-[500]">{{ state.refundDetail?.refundTypeDesc }}</span>
          </div>
          <div class="text-lg font-bold">
            <span class="text-lg font-bold">退款状态：</span>
            <el-tag :type="OrderStatus.find((item:any) => item.value === state.refundDetail?.status)?.type || 'danger'">
              {{ state.refundDetail?.statusDesc }}
            </el-tag>
          </div>
          <div v-if="state.refundDetail?.status !== 'PENDING'" class="text-lg font-bold">
            审核人：
            <span class="text-l font-[500]">{{ state.refundDetail?.reviewerName }}</span>
          </div>
          <div v-if="state.refundDetail?.status !== 'PENDING'" class="text-lg font-bold">
            审核备注：
            <span class="text-l font-[500]">{{ state.refundDetail?.reviewRemark || '无' }}</span>
          </div>
          <div class="text-lg font-bold">订单金额：￥{{ state.refundDetail?.orderPaidAmount }}</div>
          <div class="text-lg font-bold">退款金额：￥{{ state.refundDetail?.refundAmount }}</div>
        </div>
      </el-card>
      <el-card>
        <template v-slot:header>
          <div class="text-2xl font-bold">订单信息</div>
        </template>
        <div class="grid grid-cols-2 gap-4 items-center">
          <div class="text-lg font-bold">
            订单号：
            <span class="text-l font-[500]">{{ state.refundDetail?.orderNo }}</span>
          </div>
        </div>
        <div class="flex justify-center items-center mb-2">
          <div class="text-lg font-bold">退款商品列表</div>
        </div>
        <el-table
          :cell-style="() => ({ textAlign: 'center' })"
          :data="state.refundDetail?.orderItems"
          :header-cell-style="() => ({ textAlign: 'center' })"
          style="width: 100%"
          border
        >
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
          <el-table-column label="数量" prop="quantity" width="100" sortable />
          <el-table-column label="商品单价" prop="originalPrice" width="120" sortable />
          <el-table-column label="优惠金额" prop="discountAmount" width="120" sortable />
          <el-table-column label="实付金额" prop="payAmount" width="120" sortable />
        </el-table>
        <el-divider />
        <div class="grid grid-cols-2 gap-4 items-center">
          <div class="text-lg font-bold">
            退款单号：
            <span class="text-l font-[500]">{{ state.refundDetail?.refundNo }}</span>
          </div>
        </div>
        <div class="flex justify-center items-center mb-2">
          <div class="text-lg font-bold">订单商品列表</div>
        </div>

        <el-table
          :cell-style="() => ({ textAlign: 'center' })"
          :data="state.refundDetail?.refundItems"
          :header-cell-style="() => ({ textAlign: 'center' })"
          style="width: 100%"
          border
        >
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
          <el-table-column label="单价" prop="unitPrice" width="120" sortable />
          <el-table-column label="退款金额" prop="refundAmount" width="120" sortable />
        </el-table>
      </el-card>
      <el-card v-if="state.refundDetail.status == 'PENDING'">
        <template v-slot:header>
          <div class="text-2xl font-bold">退款审核</div>
        </template>
        <el-form
          ref="refundAuditFormRef"
          :model="state.refundAuditForm"
          :rules="rules"
          class="mt-4"
          label-width="120px"
        >
          <el-form-item label="审核状态" prop="approved">
            <el-radio-group v-model="state.refundAuditForm.approved">
              <el-radio :label="true">同意</el-radio>
              <el-radio :label="false">拒绝</el-radio>
            </el-radio-group>
          </el-form-item>
          <el-form-item label="审核备注" prop="auditRemark">
            <el-input v-model="state.refundAuditForm.auditRemark" type="textarea" />
          </el-form-item>
        </el-form>
      </el-card>
    </div>
    <template #footer>
      <el-button type="danger" @click="state.showAuditDrawer = false">
        {{ state.refundDetail.status == 'PENDING' ? '取消' : '关闭' }}
      </el-button>
      <el-button
        v-if="state.refundDetail.status == 'PENDING'"
        type="primary"
        @click="handleRefundAudit(props.refundApplyId)"
      >
        提交审核
      </el-button>
    </template>
  </el-drawer>
</template>

<script setup lang="ts">
import { getRefundDetail, refundAudit } from '/@/api/merchantsAlliance/order'
import { RefundDetailData } from '/@/api/merchantsAlliance/order/types'
import { ElMessage } from 'element-plus'
import { getImageUrl } from '/@/views/merchantsAlliance/way'

const props = defineProps({
  refundApplyId: {
    type: String,
    default: undefined,
  },
  isShow: {
    type: Boolean,
    default: false,
  },
})
// 定义事件
const emits = defineEmits(['error', 'update:isShow', 'success'])
// 订单详情
const refundAuditFormRef = ref<any>()
const rules = reactive({
  approved: [{ required: true, message: '请选择审核状态', trigger: 'blur' }],
})
// 状态管理
const state = reactive({
  loading: false,
  showAuditDrawer: false,
  refundDetail: {} as RefundDetailData,
  refundAuditForm: {
    approved: true,
    auditRemark: '',
  },
})
// 订单状态
const OrderStatus = [
  { value: '', label: '全部' },
  { value: 'PENDING', label: '待审核', type: 'primary' },
  { value: 'APPROVED', label: '已通过', type: 'success' },
  { value: 'REJECTED', label: '已拒绝', type: 'danger' },
  { value: 'REFUNDED', label: '已退款', type: 'info' },
] as { value: string; label: string; type?: string }[]

// 获取订单退款详情
async function getRefundDetailData(refundApplyId: string) {
  state.loading = true
  try {
    const res = await getRefundDetail(refundApplyId)
    if (res.code === 0) {
      state.refundDetail = res.data
    }
  } catch (error) {
    state.showAuditDrawer = false
    ElMessage.error('获取订单退款详情失败')
    emits('error', false)
  } finally {
    state.loading = false
  }
}

// 处理订单退款审核
async function handleRefundAudit(refundApplyId: string) {
  state.loading = true
  try {
    const res = await refundAudit({
      refundApplyId,
      approved: state.refundAuditForm.approved,
      auditRemark: state.refundAuditForm.auditRemark,
    })
    if (res.code === 0) {
      ElMessage.success('订单退款审核成功')
      emits('success', state.refundAuditForm.approved)
      if(props.refundApplyId){
        await getRefundDetailData(props.refundApplyId)
      }
    }
  } catch (error) {
    ElMessage.error('订单退款审核失败')
  } finally {
    state.loading = false
  }
}

// 监听isShow变化
watch(
  () => props.isShow,
  (newVal) => {
    if (newVal && props.refundApplyId) {
      state.showAuditDrawer = true
      getRefundDetailData(props.refundApplyId)
    } else if (newVal) {
      state.showAuditDrawer = false
      ElMessage.error('获取订单退款详情失败')
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
