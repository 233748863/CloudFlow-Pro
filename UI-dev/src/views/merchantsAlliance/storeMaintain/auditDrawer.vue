<template>
  <el-drawer
    v-model="state.showDrawer"
    :loading="state.isLoading"
    :resizable="true"
    direction="rtl"
    header-class="mb-0"
    size="70%"
    title="门审核详情"
  >
    <template v-slot:footer>
      <!-- 提交按钮 -->
      <div v-if="state.storeAuditDetail.auditStatus === 'PENDING'" class="flex flex-row gap-4 items-center justify-end">
        <el-button :loading="state.saving" type="primary" @click="handleSubmit">
          {{ state.saving ? '提交中...' : '提交' }}
        </el-button>
        <el-button @click="exitCreate">取消</el-button>
      </div>
      <div v-else class="flex flex-row gap-4 items-center justify-end">
        <el-button @click="exitCreate">关闭</el-button>
      </div>
    </template>
    <el-card class="mb-4">
      <template #header>
        <div class="flex flex-row items-center justify-between">
          <div class="flex flex-row gap-2 items-center">
            <span class="font-bold">门店ID：</span>
            <span>{{ state.storeAuditDetail.storeId }}</span>
          </div>
          <div class="flex flex-row gap-2 items-center">
            <span class="font-bold">审核ID：</span>
            <span>{{ state.storeAuditDetail.auditId }}</span>
          </div>
        </div>
      </template>
      <el-form label-width="100px">
        <div class="grid grid-cols-2">
          <el-form-item label="logo">
            <el-image
              v-if="state.storeAuditDetail?.logoUrl"
              :preview-src-list="[getImageUrl(state.storeAuditDetail?.logoUrl),]"
              :preview-teleported="true"
              :src="getImageUrl(state.storeAuditDetail?.logoUrl)"
              fit="cover"
              style="width: 100px; height: 100px"
            />
          </el-form-item>
          <el-form-item label="图片">
            <div v-if="state.storeAuditDetail?.images && state.storeAuditDetail?.images.length > 0" class="flex-1">
              <el-image
                v-for="(img, index) in state.storeAuditDetail.images"
                :key="index"
                :initial-index="index"
                :preview-src-list="state.storeAuditDetail.images.map((item: string) => getImageUrl(item))"
                :preview-teleported="true"
                :src="getImageUrl(img)"
                fit="cover"
                style="width: 100px; height: 100px; margin-right: 10px"
              />
            </div>
            <span v-else>暂无图片</span>
          </el-form-item>
          <el-form-item label="门店名称">{{ state.storeAuditDetail.storeName }}</el-form-item>
          <el-form-item label="商户名称">{{ state.storeAuditDetail.merchantName }}</el-form-item>
          <el-form-item label="营业时间">{{ state.storeAuditDetail?.businessHours }}</el-form-item>
          <el-form-item label="联系电话">{{ state.storeAuditDetail?.phone || '无' }}</el-form-item>
          <el-form-item label="地区">{{ state.storeAuditDetail.location }}</el-form-item>
          <el-form-item label="详细地址">{{ state.storeAuditDetail.addressDetail }}</el-form-item>
          <el-form-item label="行业">{{ state.storeAuditDetail.industryName }}</el-form-item>
          <el-form-item label="审核人">{{ state.storeAuditDetail?.auditBy }}</el-form-item>
          <el-form-item label="审核类型">
            <el-tag :type="auditTypes.textColor[state.storeAuditDetail?.auditType]">
              {{ auditTypes.textMap[state.storeAuditDetail?.auditType] }}
            </el-tag>
          </el-form-item>
          <el-form-item label="审核状态">
            <el-tag :type="auditStatuses.textColor[state.storeAuditDetail?.auditStatus]">
              {{ auditStatuses.textMap[state.storeAuditDetail?.auditStatus] }}
            </el-tag>
          </el-form-item>
          <el-form-item label="提交时间">{{ state.storeAuditDetail?.createdTime }}</el-form-item>
          <el-form-item label="审核时间">{{ state.storeAuditDetail?.auditTime || '无' }}</el-form-item>
          <el-form-item label="修改原因">{{ state.storeAuditDetail?.modifyReason || '暂无修改原因' }}</el-form-item>
          <el-form-item label="审核备注">{{ state.storeAuditDetail?.auditRemark || '暂无备注' }}</el-form-item>
          <el-form-item label="是否启用">
            <el-tag v-if="state.storeAuditDetail?.enable" type="success">已启用</el-tag>
            <el-tag v-else type="danger">已禁用</el-tag>
          </el-form-item>
          <el-form-item label="简介">{{ state.storeAuditDetail.description }}</el-form-item>
          <el-form-item label="营业执照号">{{ state.storeAuditDetail?.licenseNo || '无' }}</el-form-item>
          <el-form-item label="资质图片">
            <!-- 营业执照图片列表 -->
            <div v-if="state.storeAuditDetail?.licenseImages && state.storeAuditDetail?.licenseImages.length > 0" class="flex-1">
              <el-image
                v-for="(img, index) in state.storeAuditDetail?.licenseImages"
                :key="index"
                :initial-index="index"
                :preview-src-list="state.storeAuditDetail?.licenseImages.map((item: string) => getImageUrl(item))"
                :preview-teleported="true"
                :src="getImageUrl(img)"
                fit="cover"
                style="width: 100px; height: 100px; margin-right: 10px; margin-bottom: 10px"
              />
            </div>

            <span v-else>暂无资质图片</span>
          </el-form-item>
        </div>
      </el-form>
    </el-card>
    <el-card v-if="state.storeAuditDetail.auditStatus === 'PENDING'">
      <template v-slot:header>
        <span class="font-bold">审核表单</span>
      </template>
      <!-- 审核表单 -->
      <el-form ref="auditFormRef" :model="state.auditForm" :rules="auditFormRules" label-width="80px">
        <el-form-item label="审核结果" prop="auditResult">
          <el-radio-group v-model="state.auditForm.auditResult">
            <el-radio v-for="(key, value) in auditResultMap" :key="key" :label="key" :value="value" />
          </el-radio-group>
        </el-form-item>
        <el-form-item label="审核备注" prop="remark">
          <el-input v-model="state.auditForm.auditRemark" :rows="4" placeholder="请输入审核备注" type="textarea" />
        </el-form-item>
      </el-form>
    </el-card>
  </el-drawer>
</template>

<script setup lang="ts">
import { getStoreAuditDetail, handleStoreAudit } from '/@/api/merchantsAlliance/store/store'
import { ElMessage } from 'element-plus'
import { StoreAuditDetailResponse, StoreAuditHandleRequest } from '/@/api/merchantsAlliance/store/types'
import { useDict } from '/@/hooks/dict'
import { getImageUrl } from '/@/views/merchantsAlliance/way'

const { audit_statuses, audit_type } = useDict('audit_statuses', 'audit_type')
// 审核状态映射
const auditStatuses = computed(() => {
  const textMap = audit_statuses.value.reduce((prev: any, cur: any) => ({ ...prev, [cur.value]: cur.label }), {})
  const textColor = audit_statuses.value.reduce((prev: any, cur: any) => ({ ...prev, [cur.value]: cur.remarks }), {})
  return { textMap: textMap, textColor: textColor }
})
// 审核类型映射
const auditTypes = computed(() => {
  const textMap = audit_type.value.reduce((prev: any, cur: any) => ({ ...prev, [cur.value]: cur.label }), {})
  const textColor = audit_type.value.reduce((prev: any, cur: any) => ({ ...prev, [cur.value]: cur.remarks }), {})
  return { textMap: textMap, textColor: textColor }
})

const props = defineProps({
  isShow: {
    type: Boolean,
    default: () => false,
  },
  auditId: {
    type: String,
    default: null,
  },
})

const emits = defineEmits(['update:isShow', 'error', 'success'])
// 审核结果映射
const auditResultMap = computed(() => ({
  APPROVED: '通过',
  REJECTED: '拒绝',
}))

// 审核表单引用
const auditFormRef = ref<any>(null)
// 审核表单规则
const auditFormRules = computed(() => ({
  auditResult: [{ required: true, message: '请选择审核结果', trigger: ['blur'] }],
}))

const state = reactive({
  showDrawer: false,
  isLoading: false,
  saving: false,
  storeAuditDetail: {} as StoreAuditDetailResponse,
  auditForm: {
    auditId: props.auditId,
    auditResult: 'APPROVED',
    auditRemark: '',
  } as StoreAuditHandleRequest,
})

// 获取审核详情
const getAuditDetail = async () => {
  try {
    state.isLoading = true
    const res = await getStoreAuditDetail(props.auditId)
    state.storeAuditDetail = res.data as StoreAuditDetailResponse
  } catch (error) {
    ElMessage.error('获取审核详情失败')
    state.showDrawer = false
  } finally {
    state.isLoading = false
  }
}

// 处理审核提交
const handleSubmit = async () => {
  try {
    state.saving = true
    await auditFormRef.value.validate()
    state.auditForm.auditId = props.auditId
    const res = await handleStoreAudit(state.auditForm)
    if (res.code === 0) {
      ElMessage.success('审核处理成功')
      emits('success', true)
      await getAuditDetail()
    } else {
      ElMessage.error('审核处理失败')
    }
  } catch (error) {
    ElMessage.error('审核处理失败')
  } finally {
    state.saving = false
  }
}

const exitCreate = () => {
  state.showDrawer = false
}
// 监听 isShow 变化，同步更新抽屉显示状态
watch(
  () => props.isShow,
  (newVal) => {
    if (newVal && props.auditId) {
      state.showDrawer = true
      getAuditDetail()
    } else if (newVal) {
      state.showDrawer = false
      ElMessage.error('获取审核详情失败')
      emits('error', false)
    }
  }
)
watch(
  () => state.showDrawer,
  (newVal) => {
    if (!newVal) {
      emits('update:isShow', false)
    }
  }
)
</script>

<style scoped lang="scss">
:deep(.el-form-item:last-of-type) {
  margin-bottom: 18px !important;
}
</style>