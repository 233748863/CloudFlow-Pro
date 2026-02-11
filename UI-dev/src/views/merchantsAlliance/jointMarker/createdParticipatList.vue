<template>
  <div class="flex flex-col gap4 p4 h-[calc(100vh-85px)]">
    <!-- 查询条件 -->
    <el-card v-if="state.showSearch">
      <el-form ref="queryRef" :inline="true" :model="state.searchForm" size="small">
        <el-form-item label="计划名称" prop="name">
          <el-input v-model="state.searchForm.name" placeholder="请输入计划名称" style="width: 200px" />
        </el-form-item>
        <el-form-item label="计划状态" prop="status">
          <el-select v-model="state.searchForm.status" placeholder="请选择计划状态">
            <el-option label="全部" value="" />
            <el-option label="草稿" value="DRAFT" />
            <el-option label="进行中" value="ACTIVE" />
            <el-option label="暂停" value="PAUSED" />
            <el-option label="已结束" value="ENDED" />
          </el-select>
        </el-form-item>
        <el-form-item label="计划时间范围" prop="planDateRange">
          <el-date-picker
            v-model="state.searchForm.planDateRange"
            end-placeholder="结束日期"
            range-separator="至"
            start-placeholder="开始日期"
            style="width: 250px"
            type="daterange"
            value-format="YYYY-MM-DD"
          />
        </el-form-item>
        <el-form-item label="接受时间范围" prop="acceptDateRange">
          <el-date-picker
            v-model="state.searchForm.acceptDateRange"
            end-placeholder="结束日期"
            range-separator="至"
            start-placeholder="开始日期"
            style="width: 250px"
            type="daterange"
            value-format="YYYY-MM-DD"
          />
        </el-form-item>
        <el-form-item label="接受状态" prop="acceptStatus">
          <el-select v-model="state.searchForm.acceptStatus" placeholder="请选择接受状态">
            <el-option label="全部" value="" />
            <el-option label="已接受" value="ACCEPTED" />
            <el-option label="已拒绝" value="REJECTED" />
            <el-option label="待处理" value="PENDING" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-checkbox v-model="state.searchForm.onlyOwnerPublish">仅查看我发布的</el-checkbox>
        </el-form-item>
        <el-form-item>
          <el-checkbox v-model="state.searchForm.onlyOwnerAccept">仅查看我接受的</el-checkbox>
        </el-form-item>
        <el-form-item>
          <el-button icon="Search" type="primary" @click="getPlanListData">查询</el-button>
          <el-button icon="Refresh" @click="resetQuery">重置</el-button>
        </el-form-item>
      </el-form>
    </el-card>
    <!-- 联合营销计划列表 -->
    <el-card
      body-class="flex-1 flex flex-col overflow-auto"
      class="flex-1 flex flex-col"
      footer-class="py-0 mb-2"
      header-class="el-card__header"
    >
      <!-- 工具栏 -->
      <template #header>
        <div class="flex flex-row justify-between items-center">
          <el-button type="primary" @click="handleCreatePlan">创建联合营销计划</el-button>
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
        <el-table-column label="发起商户" prop="initiatorMerchantName" width="150" />
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
        <el-table-column label="创建时间" prop="createdTime" width="180" />
        <el-table-column fixed="right" label="操作" width="180">
          <template #default="scope">
            <el-button size="small" type="primary" text @click="handleViewRule(scope.row)">查看规则</el-button>
            <el-button
              v-if="scope.row.status === 'DRAFT' && scope.row.planRole === 'INITIATOR'"
              size="small"
              type="primary"
              text
              @click="handlePublishPlan(scope.row)"
            >
              发布
            </el-button>
            <el-button
              v-if="scope.row.status === 'DRAFT' && scope.row.planRole === 'INITIATOR'"
              size="small"
              type="primary"
              text
              @click="handleEditPlan(scope.row)"
            >
              编辑
            </el-button>
            <el-button
              v-if="scope.row.status === 'ACTIVE' && scope.row.planRole === 'INITIATOR'"
              size="small"
              type="primary"
              text
              @click="handleViewParticipant(scope.row)"
            >
              查看计划内成员
            </el-button>
            <el-button size="small" type="primary" text @click="showDetailDrawer(scope.row)">详情</el-button>
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
    <!-- 创建/修改联合营销计划 -->
    <create-plan-dialog
      v-model:is-show="state.showCreateDialog"
      :plan-data="state.selectedPlanData"
      @success="getPlanListData"
    />
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
  JointMarketingPlanPageRecord,
  JointMarketingPlanPageRequest,
  JointMarketingPlanPageResponse,
  JointMarketingPlanUpdateRequest,
} from '/@/api/merchantsAlliance/jointMarket/types'
import { getPlanListPage, publishPlan } from '/@/api/merchantsAlliance/jointMarket'
import CreatePlanDialog from './components/create.vue'
import DetailDialog from './components/detail.vue'
import { ElMessage } from 'element-plus'
import { onMounted, reactive } from 'vue'
import { useRouter } from 'vue-router'
import { getImageUrl } from '/@/views/merchantsAlliance/way'

// 计划状态映射
const planStatusMap = {
  DRAFT: { label: '草稿', color: 'info' },
  ACTIVE: { label: '进行中', color: 'success' },
  PAUSED: { label: '暂停', color: 'warning' },
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
  /** 创建联合营销计划弹窗是否显示 */
  showCreateDialog: false,
  /** 联合营销计划详情弹窗是否显示 */
  showDetailDrawer: false,
  /** 选中的计划ID */
  selectedPlanId: '',
  /** 规则创建弹窗是否显示 */
  showRuleDialog: false,
  /** 选中的计划数据，用于编辑 */
  selectedPlanData: null as JointMarketingPlanUpdateRequest | null,
  searchForm: {
    name: '',
    status: '',
    acceptStatus: '',
    onlyOwnerPublish: false,
    onlyOwnerAccept: false,
    planDateRange: [],
    acceptDateRange: [],
  },
  planList: [] as JointMarketingPlanPageRecord[],
  pagination: {
    currentPage: 1,
    pageSize: 10,
    total: 0,
  },
  loading: false,
})

// 获取联合营销计划列表数据
async function getPlanListData() {
  state.loading = true
  try {
    // 处理日期范围
    const [startDate, endDate] = state.searchForm.planDateRange || []
    const [acceptStartDate, acceptEndDate] = state.searchForm.acceptDateRange || []

    const query = {
      name: state.searchForm.name,
      status: state.searchForm.status,
      acceptStatus: state.searchForm.acceptStatus,
      onlyOwnerPublish: state.searchForm.onlyOwnerPublish,
      onlyOwnerAccept: state.searchForm.onlyOwnerAccept,
      startDate: startDate || '',
      endDate: endDate || '',
      acceptStartDate: acceptStartDate || '',
      acceptEndDate: acceptEndDate || '',
      pageNum: state.pagination.currentPage,
      pageSize: state.pagination.pageSize,
      publishMerchantIds: [],
    } as JointMarketingPlanPageRequest
    const res = await getPlanListPage(query)
    const data = res.data as JointMarketingPlanPageResponse
    if (data.records) {
      state.planList = data.records as JointMarketingPlanPageRecord[]
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
    name: '',
    status: '',
    acceptStatus: '',
    onlyOwnerPublish: false,
    onlyOwnerAccept: false,
    planDateRange: [],
    acceptDateRange: [],
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
const showDetailDrawer = (plan: JointMarketingPlanPageRecord) => {
  state.selectedPlanId = plan.id || ''
  state.showDetailDrawer = true
}

// 创建计划
const handleCreatePlan = () => {
  state.selectedPlanData = null
  state.showCreateDialog = true
}

// 编辑计划
const handleEditPlan = (plan: JointMarketingPlanPageRecord) => {
  state.selectedPlanData = plan
  state.showCreateDialog = true
}

// 发布计划
const handlePublishPlan = async (plan: JointMarketingPlanPageRecord) => {
  try {
    if (!plan.id) {
      ElMessage.error('计划ID不能为空')
      return
    }
    await publishPlan(plan.id)
    ElMessage.success('计划发布成功')
    await getPlanListData()
  } catch (error) {
    ElMessage.error('计划发布失败')
  }
}

const router = useRouter()

// 查看规则
const handleViewRule = (plan: JointMarketingPlanPageRecord) => {
  router.push({
    path: '/merchantsAlliance/jointMarker/ruleList',
    query: { planId: plan.id },
  })
}

onMounted(() => {
  getPlanListData()
})
</script>

<style scoped lang="scss"></style>
