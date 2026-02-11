<template>
  <!-- 审核详情抽屉 -->
  <el-drawer
    v-model="state.showDrawer"
    :loading="state.isLoading"
    :resizable="true"
    direction="rtl"
    header-class="mb-0"
    size="50%"
    title="商家审核详情"
  >
    <template #header>
      <span class="font-bold">审核详情</span>
    </template>
    <el-card class="mb-4">
      <template v-slot:header>
        <div class="flex flex-row items-center justify-between">
          <div class="font-bold">审核id:{{ state.auditDetail?.auditId }}</div>
          <div class="font-bold">名称:{{ state.auditDetail?.name }}</div>
        </div>
      </template>
      <el-form label-width="100px">
        <div class="grid grid-cols-2">
          <!-- 基本信息 -->
          <el-form-item label="logo">
            <el-image
              v-if="state.auditDetail?.logoUrl"
              :preview-src-list="[getImageUrl(state.auditDetail?.logoUrl)]"
              :preview-teleported="true"
              :src="getImageUrl(state.auditDetail?.logoUrl)"
              fit="cover"
              style="width: 100px; height: 100px"
            />
          </el-form-item>
          <el-form-item label="图片">
            <div v-if="state.auditDetail?.images && state.auditDetail?.images.length > 0" class="flex-1">
              <el-image
                v-for="(img, index) in state.auditDetail.images"
                :key="index"
                :initial-index="index"
                :preview-src-list="state.auditDetail.images.map((item: string) => getImageUrl(item))"
                :preview-teleported="true"
                :src="getImageUrl(img)"
                fit="cover"
                style="width: 100px; height: 100px; margin-right: 10px"
              />
            </div>
            <span v-else>暂无图片</span>
          </el-form-item>
          <el-form-item label="联系人姓名">{{ state.auditDetail?.contactName }}</el-form-item>
          <el-form-item label="联系人手机">{{ state.auditDetail?.contactPhone }}</el-form-item>
          <el-form-item label="所在区域">{{ state.auditDetail?.location || '未知' }}</el-form-item>
          <el-form-item label="详细地址">{{ state.auditDetail?.addressDetail || '暂无地址' }}</el-form-item>
          <el-form-item label="行业">{{ state.auditDetail?.industryName || '暂无行业分类' }}</el-form-item>
          <el-form-item label="简介">{{ state.auditDetail?.description || '暂无简介' }}</el-form-item>
          <el-form-item label="区域代理ID">{{ state.auditDetail?.agentId || '无' }}</el-form-item>
          <el-form-item label="区域代理">{{ state.auditDetail?.agentName || '无' }}</el-form-item>
          <el-form-item label="审核类型">
            <el-tag :type="auditTypes.textColor[state.auditDetail?.auditType]">
              {{ auditTypes.textMap[state.auditDetail?.auditType] }}
            </el-tag>
          </el-form-item>
          <el-form-item label="审核状态">
            <el-tag :type="auditStatuses.textColor[state.auditDetail?.auditStatus]">
              {{ auditStatuses.textMap[state.auditDetail?.auditStatus] }}
            </el-tag>
          </el-form-item>
          <el-form-item label="创建时间">{{ state.auditDetail?.createdTime }}</el-form-item>
          <el-form-item label="审核时间">{{ state.auditDetail?.auditTime || '无' }}</el-form-item>
          <el-form-item label="修改原因">{{ state.auditDetail?.modifyReason || '暂无修改原因' }}</el-form-item>
          <el-form-item label="审核备注">{{ state.auditDetail?.auditRemark || '暂无备注' }}</el-form-item>
          <el-form-item label="是否启用">
            <el-tag v-if="state.auditDetail?.enable" type="success">已启用</el-tag>
            <el-tag v-else type="danger">已禁用</el-tag>
          </el-form-item>
          <el-form-item label="商家状态">
            <el-tag :type="businessAuditTypes.textColor[state.auditDetail?.businessStatus]">
              {{ businessAuditTypes.textMap[state.auditDetail?.businessStatus] }}
            </el-tag>
          </el-form-item>
          <el-form-item label="法人姓名">{{ state.auditDetail?.legalPerson }}</el-form-item>
          <el-form-item label="营业执照号">{{ state.auditDetail?.licenseNo || '无' }}</el-form-item>
        </div>
        <el-form-item label="资质图片">
          <!-- 营业执照图片列表 -->
          <div v-if="state.auditDetail?.licenseImages && state.auditDetail?.licenseImages.length > 0" class="flex-1">
            <el-image
              v-for="(img, index) in state.auditDetail?.licenseImages"
              :key="index"
              :initial-index="index"
              :preview-src-list="state.auditDetail?.licenseImages.map((item: string) => getImageUrl(item))"
              :preview-teleported="true"
              :src="getImageUrl(img)"
              fit="cover"
              style="width: 100px; height: 100px; margin-right: 10px; margin-bottom: 10px"
            />
          </div>

          <span v-else>暂无资质图片</span>
        </el-form-item>
      </el-form>
    </el-card>
    <el-card v-if="state.auditDetail?.auditStatus === 'PENDING' && auth('platform_merchant_audit')">
      <template v-slot:header>
        <span class="font-bold">审核表单</span>
      </template>
      <!-- 审核表单 -->
      <el-form ref="auditFormRef" :model="state.auditForm" :rules="state.auditFormRules">
        <el-form-item label="审核结果" prop="auditResult">
          <el-radio-group v-model="state.auditForm.auditResult">
            <el-radio v-for="(key, value) in auditResultMap" :key="key" :label="key" :value="value" />
          </el-radio-group>
        </el-form-item>
        <el-form-item label="审核备注" prop="remark">
          <el-input v-model="state.auditForm.remark" :rows="4" placeholder="请输入审核备注" type="textarea" />
        </el-form-item>
      </el-form>
    </el-card>
    <template v-if="state.auditDetail?.auditStatus === 'PENDING'" #footer>
      <div style="display: flex; justify-content: flex-end">
        <el-button @click="state.showDrawer = false">取消</el-button>
        <el-button :v-aut="'platform_merchant_audit'" type="primary" @click="submitAudit">提交审核</el-button>
      </div>
    </template>
  </el-drawer>
</template>

<script setup lang="ts">
import { getMerchantAuditDetail, handleMerchantAudit } from '/@/api/merchantsAlliance/merchant/merchant'
import { MerchantAuditDetailResponse, MerchantAuditHandleRequest } from '/@/api/merchantsAlliance/merchant/types'
import { auth } from '/@/utils/authFunction'
import { ElMessage } from 'element-plus'
import { useDict } from '/@/hooks/dict'
import { getImageUrl } from '/@/views/merchantsAlliance/way'
const { audit_statuses, audit_type, merchant_audit_type } = useDict(
  'audit_statuses',
  'audit_type',
  'merchant_audit_type'
)
// 商家审核类型映射
const businessAuditTypes = computed(() => {
  const textMap = merchant_audit_type.value.reduce((prev: any, cur: any) => ({ ...prev, [cur.value]: cur.label }), {})
  const textColor = merchant_audit_type.value.reduce(
    (prev: any, cur: any) => ({
      ...prev,
      [cur.value]: cur.remarks,
    }),
    {}
  )
  return { textMap: textMap, textColor: textColor }
})
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
    default: undefined,
  },
})
const emits = defineEmits(['update:isShow', 'error', 'success'])
const auditFormRef = ref<any>(null)
const state = reactive({
  // 抽屉是否显示
  showDrawer: false,
  // 审核详情
  auditDetail: {} as MerchantAuditDetailResponse,
  // 审核表单
  auditForm: {
    auditResult: 'APPROVED',
    remark: '',
  },
  // 审核表单校验规则
  auditFormRules: {
    auditResult: [{ required: true, message: '请选择审核结果', trigger: ['blur'] }],
  },
  // 是否加载中
  isLoading: false,
})
// 审核结果映射
const auditResultMap = computed(() => ({
  APPROVED: '通过',
  REJECTED: '拒绝',
}))

// 获取审核详情
const getAuditDetail = async () => {
  try {
    state.isLoading = true
    if (!props.auditId) {
      ElMessage.error('审核ID不能为空')
      return
    }
    const res = await getMerchantAuditDetail(props.auditId)
    state.auditDetail = res.data || {}
  } catch (error) {
    state.showDrawer = false
    ElMessage.error('获取审核详情失败')
  } finally {
    state.isLoading = false
  }
}

// 提交审核
const submitAudit = async () => {
  try {
    if (!auditFormRef.value) {
      ElMessage.error('审核表单不能为空')
      return
    }
    await auditFormRef.value.validate()
    const query = {
      auditId: props.auditId,
      auditResult: state.auditForm.auditResult,
      remark: state.auditForm.remark,
    } as MerchantAuditHandleRequest
    const res = await handleMerchantAudit(query)
    if (res.code === 0) {
      ElMessage.success('审核提交成功')
      emits('update:isShow', false)
      state.showDrawer = false
      emits('success', true)
    } else {
      ElMessage.error(res.msg || '审核提交失败')
    }
  } catch (error) {
    ElMessage.error('审核提交失败')
  }
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
