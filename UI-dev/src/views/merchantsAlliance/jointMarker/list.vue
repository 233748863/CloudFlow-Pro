<template>
  <div class="flex flex-col h-full w-full">
    <!-- 搜索区域 -->
    <el-card class="mb-4" shadow="never">
      <el-form :model="state.searchForm" class="flex flex-wrap" label-width="80px" size="small">
        <el-form-item label="计划名称">
          <el-input
            v-model="state.searchForm.planName"
            placeholder="请输入计划名称"
            style="width: 200px"
          />
        </el-form-item>
        <el-form-item label="发起商户">
          <el-input
            v-model="state.searchForm.merchantName"
            placeholder="请输入发起商户名称"
            style="width: 200px"
          />
        </el-form-item>
        <el-form-item>
          <el-button icon="Search" type="primary" @click="getPlanListData">查询</el-button>
          <el-button icon="Refresh" @click="resetQuery">重置</el-button>
        </el-form-item>
      </el-form>
    </el-card>
    <!-- 联合营销计划审核列表 -->
    <el-card
      body-class="flex-1 flex flex-col overflow-auto"
      class="flex-1 flex flex-col"
      footer-class="py-0 mb-2"
      header-class="el-card__header"
    >
      <!-- 工具栏 -->
      <template #header>
        <div class="flex flex-row justify-between items-center">
          <span>联合营销计划审核</span>
          <right-toolbar
            v-model:show-search="state.showSearch"
            class="flex flex-row justify-end"
            @queryTable="getPlanListData"
          />
        </div>
      </template>

      <!-- 表格 -->
      <el-table
        v-loading="state.loading"
        :cell-style="{ textAlign: 'center' }"
        :data="state.planList"
        :header-cell-style="{ textAlign: 'center' }"
        class="h-full"
        style="width: 100%"
        border
      >
        <el-table-column label="计划ID" prop="id" width="120" />
        <el-table-column label="计划名称" min-width="180" prop="name" show-overflow-tooltip />
        <el-table-column label="计划描述" min-width="200" prop="description" show-overflow-tooltip />
        <el-table-column label="开始时间" prop="startTime" width="180" />
        <el-table-column label="结束时间" prop="endTime" width="180" />
        <el-table-column label="发起商户" prop="initiatorMerchantName" width="120" />
        <el-table-column label="商户Logo" prop="initiatorMerchantLogo" width="80">
          <template #default="scope">
            <el-image
              v-if="scope.row.initiatorMerchantLogo"
              :preview-src-list="[getImageUrl(scope.row.initiatorMerchantLogo)]"
              :src="getImageUrl(scope.row.initiatorMerchantLogo)"
              fit="cover"
              style="width: 40px; height: 40px; border-radius: 50%"
            />
          </template>
        </el-table-column>
        <el-table-column label="联合时间" prop="jointTime" width="180" />
        <el-table-column label="计划角色" prop="planRole" width="120" />
        <el-table-column label="状态" prop="status" width="100" show-overflow-tooltip>
          <template #default="scope">
            <el-tag :type="getStatusColor(scope.row.status)">
              {{ getStatusLabel(scope.row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column fixed="right" label="操作" width="200">
          <template #default="scope">
            <el-button size="small" type="primary" text @click="showDetailDrawer(scope.row)">详情</el-button>
            <el-button size="small" type="success" text @click="handleAuditPass(scope.row)">审核通过</el-button>
            <el-button size="small" type="danger" text @click="handleAuditReject(scope.row)">审核拒绝</el-button>
          </template>
        </el-table-column>
      </el-table>

      <!-- 分页 -->
      <template #footer>
        <!-- 分页 -->
        <el-pagination
          v-model:current-page="state.pagination.currentPage"
          v-model:page-size="state.pagination.pageSize"
          :page-sizes="[10, 20, 50, 100]"
          :total="state.pagination.total"
          layout="total, sizes, prev, pager, next, jumper"
          @current-change="handleCurrentChange"
          @size-change="handleSizeChange"
        />
      </template>
    </el-card>
    <!-- 联合营销计划详情 -->
    <detail-dialog
      v-model:is-show="state.showDetailDrawer"
      :plan-id="state.selectedPlanId"
      @success="getPlanListData"
    />
  </div>
</template>

<script setup lang="ts">
import {
  JointMarketingAuditPendingPlanRequest,
  JointMarketingPendingPlanListRecord,
  JointMarketingPendingPlanListRequest,
  JointMarketingPendingPlanListResponse,
} from '/@/api/merchantsAlliance/jointMarket/types'
import { auditPendingPlan, getPendingPlanList } from '/@/api/merchantsAlliance/jointMarket'
import DetailDialog from './components/detail.vue'
import { ElMessage } from 'element-plus'
import { onMounted, reactive } from 'vue'
import { getImageUrl } from '/@/views/merchantsAlliance/way'

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

const state = reactive({
  /** 搜索表单 */
  showSearch: true,
  /** 联合营销计划详情弹窗是否显示 */
  showDetailDrawer: false,
  /** 选中的计划ID */
  selectedPlanId: '',
  searchForm: {
    planName: '',
    merchantName: '',
  },
  planList: [] as JointMarketingPendingPlanListRecord[],
  pagination: {
    currentPage: 1,
    pageSize: 10,
    total: 0,
  },
  loading: false,
})

// 获取联合营销计划审核列表数据
async function getPlanListData() {
  state.loading = true
  try {
    const query = {
      planName: state.searchForm.planName,
      merchantName: state.searchForm.merchantName,
      pageNum: state.pagination.currentPage,
      pageSize: state.pagination.pageSize,
    } as JointMarketingPendingPlanListRequest

    const res = await getPendingPlanList(query)
    const data = res.data as JointMarketingPendingPlanListResponse

    if (data.records) {
      state.planList = data.records as JointMarketingPendingPlanListRecord[]
    }

    state.pagination = {
      currentPage: data.current || 1,
      pageSize: data.size || 10,
      total: data.total || 0,
    }
  } catch (error) {
    ElMessage.error('获取联合营销计划列表失败')
    console.log(error)
  } finally {
    state.loading = false
  }
}

// 重置查询条件
const resetQuery = () => {
  state.searchForm = {
    planName: '',
    merchantName: '',
  }
  state.pagination = {
    currentPage: 1,
    pageSize: 10,
    total: 0,
  }
  getPlanListData()
}

// 分页大小改变处理
const handleSizeChange = (pageSize: number) => {
  state.pagination.pageSize = pageSize
  getPlanListData()
}

// 分页当前页改变处理
const handleCurrentChange = (page: number) => {
  state.pagination.currentPage = page
  getPlanListData()
}

// 显示联合营销计划详情弹窗
const showDetailDrawer = (plan: JointMarketingPendingPlanListRecord) => {
  state.selectedPlanId = plan.id || ''
  state.showDetailDrawer = true
}

// 审核通过
const handleAuditPass = async (plan: JointMarketingPendingPlanListRecord) => {
  try {
    if (!plan.id) {
      ElMessage.error('计划ID不能为空')
      return
    }

    const auditRequest: JointMarketingAuditPendingPlanRequest = {
      planId: plan.id,
      approve: true,
      reason: '审核通过'
    }

    await auditPendingPlan(auditRequest)
    ElMessage.success('审核通过')
    await getPlanListData()
  } catch (error) {
    ElMessage.error('审核失败')
    console.log(error)
  }
}

// 审核拒绝
const handleAuditReject = async (plan: JointMarketingPendingPlanListRecord) => {
  try {
    if (!plan.id) {
      ElMessage.error('计划ID不能为空')
      return
    }

    const reason = prompt('请输入拒绝理由：')
    if (!reason) {
      return
    }

    const auditRequest: JointMarketingAuditPendingPlanRequest = {
      planId: plan.id,
      approve: false,
      reason: reason
    }

    await auditPendingPlan(auditRequest)
    ElMessage.success('审核拒绝')
    await getPlanListData()
  } catch (error) {
    ElMessage.error('审核失败')
    console.log(error)
  }
}

onMounted(() => {
  getPlanListData()
})
</script>

<style scoped lang="scss"></style>
<style scoped lang="scss"></style>