<template>
  <!-- 营销计划详情抽屉 -->
  <el-drawer
    v-model="state.showDrawer"
    :loading="state.isLoading"
    :resizable="true"
    direction="rtl"
    header-class="mb-0"
    size="50%"
    title="营销计划详情"
  >
    <template #header>
      <span class="font-bold">营销计划详情</span>
    </template>
    <el-card class="mb-4">
      <template v-slot:header>
        <div class="flex flex-row items-center justify-between">
          <div class="font-bold">计划ID: {{ state.planDetail?.id }}</div>
          <div class="font-bold">名称: {{ state.planDetail?.name }}</div>
        </div>
      </template>
      <el-form label-width="150px">
        <div class="grid grid-cols-2 gap-4">
          <!-- 基本信息 -->
          <el-form-item label="计划ID">
            <div>{{ state.planDetail?.id || '暂无数据' }}</div>
          </el-form-item>
          <el-form-item label="计划名称">
            <div>{{ state.planDetail?.name || '暂无数据' }}</div>
          </el-form-item>
          <el-form-item :span="2" label="计划描述">
            <div class="col-span-2">{{ state.planDetail?.description || '暂无描述' }}</div>
          </el-form-item>
          <el-form-item label="开始时间">
            <div>{{ state.planDetail?.startTime || '暂无数据' }}</div>
          </el-form-item>
          <el-form-item label="结束时间">
            <div>{{ state.planDetail?.endTime || '暂无数据' }}</div>
          </el-form-item>
          <el-form-item label="创建者商户ID">
            <div>{{ state.planDetail?.initiatorMerchantId || '暂无数据' }}</div>
          </el-form-item>
          <el-form-item label="计划状态">
            <el-tag :type="getStatusColor(state.planDetail?.status)">
              {{ getStatusLabel(state.planDetail?.status) }}
            </el-tag>
          </el-form-item>
          <el-form-item label="创建时间">
            <div>{{ state.planDetail?.createdTime || '暂无数据' }}</div>
          </el-form-item>
        </div>
      </el-form>
    </el-card>
    <template #footer>
      <div style="display: flex; justify-content: flex-end">
        <el-button @click="state.showDrawer = false">关闭</el-button>
        <el-button v-if="state.planDetail?.status === 'DRAFT'" type="primary" @click="handlePublishPlan">发布计划</el-button>
      </div>
    </template>
  </el-drawer>
</template>

<script setup lang="ts">
import { getPlanDetail, publishPlan } from '/@/api/merchantsAlliance/jointMarket'
import { JointMarketingPlanDetailResponse } from '/@/api/merchantsAlliance/jointMarket/types'
import { ElMessage } from 'element-plus'
import { reactive, watch } from 'vue'

// 计划状态映射
const planStatusMap = {
  DRAFT: { label: '草稿', color: 'info' },
  ACTIVE: { label: '进行中', color: 'success' },
  PAUSE: { label: '暂停', color: 'warning' },
  ENDED: { label: '已结束', color: 'danger' },
} as Record<string, Record<string, string>>

// 获取状态标签
const getStatusLabel = (status: string) => {
  return planStatusMap[status]?.label || status
}

// 获取状态颜色
const getStatusColor = (status: string) => {
  return planStatusMap[status]?.color || 'info'
}

const props = defineProps({
  isShow: {
    type: Boolean,
    default: false,
  },
  planId: {
    type: String,
    default: undefined,
  },
})

const emits = defineEmits(['update:isShow', 'error', 'success'])

const state = reactive({
  // 抽屉是否显示
  showDrawer: false,
  // 计划详情
  planDetail: {} as JointMarketingPlanDetailResponse,
  // 是否加载中
  isLoading: false,
})

// 获取计划详情
const getPlanDetailData = async () => {
  try {
    state.isLoading = true
    if (!props.planId) {
      ElMessage.error('计划ID不能为空')
      return
    }
    const res = await getPlanDetail(props.planId)
    state.planDetail = res.data || {}
  } catch (error) {
    state.showDrawer = false
    ElMessage.error('获取计划详情失败')
    emits('error', false)
  } finally {
    state.isLoading = false
  }
}

// 发布计划
const handlePublishPlan = async () => {
  try {
    if (!props.planId) {
      ElMessage.error('计划ID不能为空')
      return
    }
    await publishPlan(props.planId)
    ElMessage.success('计划发布成功')
    emits('success', true)
    state.showDrawer = false
  } catch (error) {
    ElMessage.error('计划发布失败')
  }
}

// 监听 isShow 变化，同步更新抽屉显示状态
watch(
  () => props.isShow,
  (newVal) => {
    if (newVal && props.planId) {
      state.showDrawer = true
      getPlanDetailData()
    } else if (newVal) {
      state.showDrawer = false
      ElMessage.error('获取计划详情失败')
      emits('error', false)
    }
  }
)

// 监听抽屉关闭状态
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
