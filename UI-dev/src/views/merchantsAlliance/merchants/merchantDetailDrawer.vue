<template>
  <el-drawer
    v-model="state.showDrawer"
    :loading="state.isLoading"
    :resizable="true"
    direction="rtl"
    header-class="mb-0"
    size="50%"
    title="商家详情"
  >
    <template #header>
      <span class="font-bold">详情</span>
    </template>
    <el-card class="mb-4">
      <template v-slot:header>
        <div class="flex flex-row items-center justify-between">
          <div class="font-bold">商家id:{{ state.merchantDetail?.id }}</div>
          <div class="font-bold">名称:{{ state.merchantDetail?.name }}</div>
        </div>
      </template>
      <el-form label-width="100px">
        <div class="grid grid-cols-2">
          <el-form-item label="商家ID">{{ state.merchantDetail.id }}</el-form-item>
          <el-form-item label="商家名称">{{ state.merchantDetail.name }}</el-form-item>
          <el-form-item label="logo">
            <el-image
              v-if="state.merchantDetail?.logoUrl"
              :preview-src-list="[getImageUrl(state.merchantDetail?.logoUrl)]"
              :preview-teleported="true"
              :src="getImageUrl(state.merchantDetail?.logoUrl)"
              fit="cover"
              style="width: 100px; height: 100px"
            />
          </el-form-item>
          <el-form-item label="图片">
            <div v-if="state.merchantDetail?.images && state.merchantDetail?.images.length > 0" class="flex-1">
              <el-image
                v-for="(img, index) in state.merchantDetail.images"
                :key="index"
                :initial-index="index"
                :preview-src-list="
                        state.merchantDetail.images.map((item: string) => getImageUrl(item))
                      "
                :preview-teleported="true"
                :src="getImageUrl(img)"
                fit="cover"
                style="width: 100px; height: 100px; margin-right: 10px"
              />
            </div>
            <span v-else>暂无图片</span>
          </el-form-item>
          <el-form-item label="联系人">{{ state.merchantDetail.contactName }}</el-form-item>
          <el-form-item label="联系电话">{{ state.merchantDetail.contactPhone }}</el-form-item>
          <el-form-item label="地址">{{ state.merchantDetail.location }}</el-form-item>
          <el-form-item label="详细地址">{{ state.merchantDetail.addressDetail }}</el-form-item>
          <el-form-item label="行业">{{ state.merchantDetail.industryName }}</el-form-item>
          <el-form-item label="商家介绍">{{ state.merchantDetail.description }}</el-form-item>
          <el-form-item label="是否启用">
            <el-tag v-if="state.merchantDetail?.enable" type="success">已启用</el-tag>
            <el-tag v-else type="danger">已禁用</el-tag>
          </el-form-item>
          <el-form-item label="商家状态">
            <el-tag :type="businessAuditTypes.textColor[state.merchantDetail?.businessStatus]">
              {{ businessAuditTypes.textMap[state.merchantDetail?.businessStatus] }}
            </el-tag>
          </el-form-item>
          <el-form-item label="法人姓名">{{ state.merchantDetail?.legalPerson }}</el-form-item>
          <el-form-item label="营业执照号">{{ state.merchantDetail?.licenseNo || '无' }}</el-form-item>
        </div>
        <el-form-item label="资质图片">
          <!-- 营业执照图片列表 -->
          <div
            v-if="state.merchantDetail?.licenseImages && state.merchantDetail?.licenseImages.length > 0"
            class="flex-1"
          >
            <el-image
              v-for="(img, index) in state.merchantDetail?.licenseImages"
              :key="index"
              :initial-index="index"
              :preview-src-list="
                        state.merchantDetail?.licenseImages.map((item: string) => getImageUrl(item))
                      "
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
    <el-card>
      <template v-slot:header>
        <div class="font-bold">门店列表</div>
      </template>
      <el-table
        v-loading="state.isLoading"
        :cell-style="() => ({ textAlign: 'center' })"
        :data="state.merchantDetail?.stores"
        :header-cell-style="() => ({ textAlign: 'center' })"
        style="width: 100%"
        border
      >
        <el-table-column label="门店ID" prop="id" width="100" />
        <el-table-column label="门店名称" prop="name" width="150" />
        <el-table-column label="logo" prop="logoUrl" width="80" show-overflow-tooltip>
          <template #default="scope">
            <el-image
              :preview-src-list="[getImageUrl(scope.row.logoUrl)]"
              :preview-teleported="true"
              :src="getImageUrl(scope.row.logoUrl)"
              fit="fill"
              style="width: 50px; height: 50px"
            />
          </template>
        </el-table-column>
        <el-table-column label="门店地址" min-width="150" prop="addressDetail" />
        <el-table-column label="营业时间" prop="businessHours" width="150" />
        <el-table-column label="门店状态" prop="businessStatus" width="100">
          <template #default="scope">
            <el-tag v-if="scope.row.businessStatus" :type="shopAuditStatuses.textColor[scope.row.businessStatus]">
              {{ shopAuditStatuses.textMap[scope.row.businessStatus] }}
            </el-tag>
            <el-tag v-else type="danger">未知</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="是否启用" width="100">
          <template #default="scope">
            <el-tag v-if="scope.row.enable" type="success">已启用</el-tag>
            <el-tag v-else type="danger">已禁用</el-tag>
          </template>
        </el-table-column>
      </el-table>
    </el-card>
  </el-drawer>
</template>

<script setup lang="ts">
import { ElMessage } from 'element-plus'
import { getMerchantDetail } from '/@/api/merchantsAlliance/merchant/merchant'
import { MerchantDetailsResponse } from '/@/api/merchantsAlliance/merchant/types'
import { useDict } from '/@/hooks/dict'
import { getImageUrl } from '/@/views/merchantsAlliance/way'

const { merchant_audit_type, shop_audit_type } = useDict('merchant_audit_type', 'shop_audit_type')
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
// 门店经营状态映射
const shopAuditStatuses = computed(() => {
  const textMap = shop_audit_type.value.reduce((prev: any, cur: any) => ({ ...prev, [cur.value]: cur.label }), {})
  const textColor = shop_audit_type.value.reduce((prev: any, cur: any) => ({ ...prev, [cur.value]: cur.remarks }), {})
  return { textMap: textMap, textColor: textColor }
})

const props = defineProps({
  isShow: {
    type: Boolean,
    default: () => false,
  },
  merchantId: {
    type: String,
    default: undefined,
  },
})
const emits = defineEmits(['update:isShow', 'error'])
const state = reactive({
  showDrawer: false,
  isLoading: false,
  merchantDetail: {} as MerchantDetailsResponse,
})

const getMerchantDetailData = async () => {
  state.isLoading = true
  try {
    if (!props.merchantId) {
      ElMessage.error('商家ID不能为空')
      emits('error', false)
      return
    }
    const res = await getMerchantDetail(props.merchantId)
    state.merchantDetail = res.data as MerchantDetailsResponse
  } catch (error) {
    ElMessage.error('获取商家详情失败')
    emits('error', false)
  } finally {
    state.isLoading = false
  }
}

// 监听 isShow 变化，同步更新抽屉显示状态
watch(
  () => props.isShow,
  (newVal) => {
    if (newVal && props.merchantId) {
      state.showDrawer = true
      getMerchantDetailData()
    } else if (newVal) {
      state.showDrawer = false
      ElMessage.error('获取商家详情失败')
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