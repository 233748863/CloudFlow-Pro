<template>
  <el-drawer
    v-model="state.showDrawer"
    :loading="state.isLoading"
    :resizable="true"
    direction="rtl"
    header-class="mb-0"
    size="70%"
    title="店铺详情"
  >
    <el-card class="mb-4">
      <template #header>
        <div class="flex flex-row items-center justify-between">
          <div class="flex flex-row gap-2 items-center">
            <span class="font-bold">门店ID：</span>
            <span>{{ state.storeDetail.storeId }}</span>
          </div>
          <div class="flex flex-row gap-2 items-center">
            <span class="font-bold">商家ID：</span>
            <span>{{ state.storeDetail.merchantId }}</span>
          </div>
        </div>
      </template>
      <el-form label-width="100px">
        <div class="grid grid-cols-2">
          <el-form-item label="门店logo">
            <el-image
              v-if="state.storeDetail?.logoUrl"
              :preview-src-list="[getImageUrl(state.storeDetail?.logoUrl)]"
              :preview-teleported="true"
              :src="getImageUrl(state.storeDetail?.logoUrl)"
              fit="cover"
              style="width: 100px; height: 100px"
            />
          </el-form-item>
          <el-form-item label="门店图片">
            <div v-if="state.storeDetail?.images && state.storeDetail?.images.length > 0" class="flex-1">
              <el-image
                v-for="(img, index) in state.storeDetail.images"
                :key="index"
                :initial-index="index"
                :preview-src-list="state.storeDetail.images.map((item: string) => getImageUrl(item))"
                :preview-teleported="true"
                :src="getImageUrl(img)"
                fit="cover"
                style="width: 100px; height: 100px; margin-right: 10px"
              />
            </div>
            <span v-else>暂无图片</span>
          </el-form-item>
          <el-form-item label="门店名称">{{ state.storeDetail.name }}</el-form-item>
          <el-form-item label="营业时间">{{ state.storeDetail?.businessHours }}</el-form-item>
          <el-form-item label="联系电话">{{ state.storeDetail?.phone || '无' }}</el-form-item>
          <el-form-item label="地区">{{ state.storeDetail.location }}</el-form-item>
          <el-form-item label="详细地址">{{ state.storeDetail.addressDetail }}</el-form-item>
          <el-form-item label="行业">{{ state.storeDetail.industryName }}</el-form-item>
          <el-form-item label="审核人">{{ state.storeDetail?.auditBy }}</el-form-item>
          <el-form-item label="商户名称">{{ state.storeDetail.merchantName }}</el-form-item>
          <el-form-item label="审核类型">
            <el-tag :type="auditTypes.textColor[state.storeDetail?.auditType]">
              {{ auditTypes.textMap[state.storeDetail?.auditType] }}
            </el-tag>
          </el-form-item>
          <el-form-item label="审核状态">
            <el-tag :type="auditStatuses.textColor[state.storeDetail?.auditStatus]">
              {{ auditStatuses.textMap[state.storeDetail?.auditStatus] }}
            </el-tag>
          </el-form-item>
          <el-form-item label="提交时间">{{ state.storeDetail?.createdTime }}</el-form-item>
          <el-form-item label="审核时间">{{ state.storeDetail?.auditTime || '无' }}</el-form-item>
          <el-form-item label="修改原因">{{ state.storeDetail?.modifyReason || '暂无修改原因' }}</el-form-item>
          <el-form-item label="审核备注">{{ state.storeDetail?.auditRemark || '暂无备注' }}</el-form-item>
          <el-form-item label="是否启用">
            <el-tag v-if="state.storeDetail?.enable" type="success">已启用</el-tag>
            <el-tag v-else type="danger">已禁用</el-tag>
          </el-form-item>
          <el-form-item label="简介">{{ state.storeDetail.description }}</el-form-item>
          <el-form-item label="营业执照号">{{ state.storeDetail?.licenseNo || '无' }}</el-form-item>
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
        </div>
      </el-form>
    </el-card>
  </el-drawer>
</template>

<script setup lang="ts">
import { getStoreDetail } from '/@/api/merchantsAlliance/store/store'
import { ElMessage } from 'element-plus'
import { StoreDetailResponse } from '/@/api/merchantsAlliance/store/types'
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
    required: true,
    default: false
  },
  auditId: {
    type: String,
    required: true,
    default: ''
  }
})

const emits = defineEmits(['update:isShow', 'error'])

const state = reactive({
  showDrawer: props.isShow,
  isLoading: false,
  storeDetail: {} as StoreDetailResponse,
})

// 获取门店详情
const getStoreDetailData = async () => {
  try {
    state.isLoading = true
    const res = await getStoreDetail(props.auditId)
    state.storeDetail = res.data as StoreDetailResponse
  } catch (error) {
    ElMessage.error('获取门店详情失败')
  } finally {
    state.isLoading = false
  }
}

// 监听 isShow 变化，同步更新抽屉显示状态
watch(
  () => props.isShow,
  (newVal) => {
    if (newVal && props.auditId) {
      state.showDrawer = true
      getStoreDetailData()
    } else if (newVal) {
      state.showDrawer = false
      ElMessage.error('获取门店详情失败')
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

</style>