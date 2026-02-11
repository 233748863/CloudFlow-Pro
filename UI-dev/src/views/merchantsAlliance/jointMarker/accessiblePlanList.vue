<template>
  <div class="flex flex-col gap4 p4 h-[calc(100vh-85px)]">
    <!-- 查询条件 -->
    <el-card v-if="state.showSearch">
      <el-form ref="queryRef" :inline="true" :model="state.searchForm" size="small">
        <el-form-item label="计划名称" prop="planName">
          <el-input v-model="state.searchForm.planName" placeholder="请输入计划名称" style="width: 200px" />
        </el-form-item>
        <el-form-item label="计划状态" prop="status">
          <el-select v-model="state.searchForm.status" placeholder="请选择计划状态">
            <el-option label="全部" value="" />
            <el-option label="未开始" value="NOT_STARTED" />
            <el-option label="进行中" value="IN_PROGRESS" />
            <el-option label="已结束" value="ENDED" />
            <el-option label="已关闭" value="CLOSED" />
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
        <el-form-item label="地区" prop="regionCode">
          <ChinaArea v-model="state.searchForm.regionCode" placeholder="请选择地区" />
        </el-form-item>
        <el-form-item label="行业" prop="industryId">
          <el-select
            v-model="state.searchForm.industryId"
            :loading="state.loadingIndustry"
            :remote-method="loadIndustryList"
            placeholder="请选择行业"
            filterable
            multiple
            remote
          >
            <el-option label="全部" value="" />
            <el-option
              v-for="industry in state.industryList"
              :key="industry.id"
              :label="industry.name"
              :value="industry.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button icon="Search" type="primary" @click="getPlanApplyListData">查询</el-button>
          <el-button icon="Refresh" @click="resetQuery">重置</el-button>
        </el-form-item>
      </el-form>
    </el-card>
    <!-- 计划申请加入列表 -->
    <el-card
      body-class="flex-1 flex flex-col overflow-auto"
      class="flex-1 flex flex-col"
      footer-class="py-0 mb-2"
      header-class="el-card__header"
    >
      <!-- 工具栏 -->
      <template #header>
        <div class="flex flex-row justify-between items-center">
          <span class="text-xl font-bold">可申请加入计划列表</span>
          <right-toolbar
            v-model:show-search="state.showSearch"
            class="flex flex-row justify-end"
            @queryTable="getPlanApplyListData"
          />
        </div>
      </template>

      <!-- 表格 -->
      <el-table
        v-loading="state.loading"
        :cell-style="{ textAlign: 'center' }"
        :data="state.planApplyList"
        :header-cell-style="{ textAlign: 'center' }"
        class="h-full"
        style="width: 100%"
        border
      >
        <el-table-column label="计划ID" prop="id" width="120" />
        <el-table-column label="计划名称" min-width="180" prop="name" show-overflow-tooltip />
        <el-table-column label="计划描述" min-width="200" prop="description" show-overflow-tooltip />
        <el-table-column label="计划状态" prop="status" width="100" show-overflow-tooltip>
          <template #default="scope">
            <el-tag :type="getPlanStatusColor(scope.row.status)">
              {{ getPlanStatusLabel(scope.row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="计划开始时间" prop="startTime" width="180" />
        <el-table-column label="计划结束时间" prop="endTime" width="180" />
        <el-table-column label="创建者" min-width="180" prop="initiatorMerchantName" show-overflow-tooltip />
        <el-table-column label="创建时间" prop="createdTime" width="180" />
        <el-table-column fixed="right" label="操作" width="150">
          <template #default="scope">
            <el-button size="small" type="success" text @click="handleJoinPlan(scope.row)">申请加入</el-button>
            <el-button size="small" type="primary" text @click="handleViewPlanDetail(scope.row)">查看详情</el-button>
          </template>
        </el-table-column>
      </el-table>

      <!-- 分页 -->
      <template #footer>
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
  </div>
</template>

<script setup lang="ts">
import {
  JointMarketingPlanApplyListRecord,
  JointMarketingPlanApplyListRequest,
  JointMarketingPlanApplyListResponse,
} from '/@/api/merchantsAlliance/jointMarket/types'
import { getPlanApplyList, joinPlanApply } from '/@/api/merchantsAlliance/jointMarket'
import { getIndustryList } from '/@/api/merchantsAlliance/platformIndustry'
import { ElMessage } from 'element-plus'
import { onMounted, reactive } from 'vue'
import { useRouter } from 'vue-router'
import ChinaArea from '/@/components/ChinaArea/index.vue'
import { PlatformIndustry } from '/@/api/merchantsAlliance/store/types'

// 计划状态映射
const planStatusMap = {
  NOT_STARTED: { label: '未开始', color: 'info' },
  IN_PROGRESS: { label: '进行中', color: 'success' },
  ENDED: { label: '已结束', color: 'danger' },
  CLOSED: { label: '已关闭', color: 'warning' },
} as Record<string, Record<string, string>>

// 获取计划状态标签
const getPlanStatusLabel = (status: string) => {
  return planStatusMap[status]?.label || status
}

// 获取计划状态颜色
const getPlanStatusColor = (status: string) => {
  return planStatusMap[status]?.color || 'info'
}

const state = reactive({
  /** 搜索表单 */
  showSearch: true,
  searchForm: {
    planName: '',
    status: '',
    planDateRange: [],
    regionCode: '440000,441200,441284,441284450',
    industryId: '',
  },
  planApplyList: [] as JointMarketingPlanApplyListRecord[],
  industryList: [] as any[],
  pagination: {
    currentPage: 1,
    pageSize: 10,
    total: 0,
  },
  loading: false,
  loadingIndustry: false,
})

// 加载行业列表
const loadIndustryList = async (name: string) => {
  try {
    state.loadingIndustry = true
    const response = await getIndustryList({ name: name || '', page: 1, pageSize: 20 })
    state.industryList = response.data.records || ([] as PlatformIndustry[])
  } catch (err) {
    ElMessage.error('获取行业列表失败')
  } finally {
    state.loadingIndustry = false
  }
}

// 获取可申请加入计划列表数据
async function getPlanApplyListData() {
  state.loading = true
  try {
    // 处理日期范围
    const [startDate, endDate] = state.searchForm.planDateRange || []

    // 处理地区编码
    const regionCodes = state.searchForm.regionCode ? state.searchForm.regionCode.split(',') : []

    // 处理行业ID
    const industryIds = state.searchForm.industryId ? state.searchForm.industryId : []

    const query = {
      pageNum: state.pagination.currentPage,
      pageSize: state.pagination.pageSize,
      planName: state.searchForm.planName,
      // 区域编码和行业ID
      regionCodes: regionCodes,
      industryIds: industryIds,
      merchantIds: [],
    } as JointMarketingPlanApplyListRequest

    const res = await getPlanApplyList(query)
    const data = res.data as JointMarketingPlanApplyListResponse

    // 过滤计划名称和状态
    let filteredRecords = data.records || []
    if (state.searchForm.planName) {
      filteredRecords = filteredRecords.filter((record) => record.name?.includes(state.searchForm.planName!))
    }
    if (state.searchForm.status) {
      filteredRecords = filteredRecords.filter((record) => record.status === state.searchForm.status)
    }
    // 如果需要根据日期范围过滤，可以在这里处理
    if (startDate && endDate) {
      filteredRecords = filteredRecords.filter((record) => {
        const recordStartDate = new Date(record.startTime)
        const recordEndDate = new Date(record.endTime)
        const filterStartDate = new Date(startDate)
        const filterEndDate = new Date(endDate)
        // 只显示计划时间与过滤时间有重叠的记录
        return (
          (recordStartDate >= filterStartDate && recordStartDate <= filterEndDate) ||
          (recordEndDate >= filterStartDate && recordEndDate <= filterEndDate) ||
          (recordStartDate <= filterStartDate && recordEndDate >= filterEndDate)
        )
      })
    }

    state.planApplyList = filteredRecords
    state.pagination = {
      currentPage: data.current || 1,
      pageSize: data.size || 10,
      total: data.total || 0,
    }
  } catch (error) {
    ElMessage.error('获取可申请加入计划列表失败')
    console.error(error)
  } finally {
    state.loading = false
  }
}

// 重置查询条件
const resetQuery = () => {
  state.searchForm = {
    planName: '',
    status: '',
    planDateRange: [],
    regionCode: '',
    industryId: '',
  }
  state.pagination = {
    currentPage: 1,
    pageSize: 10,
    total: 0,
  }
  getPlanApplyListData()
}

// 分页大小改变处理
const handleSizeChange = (pageSize: number) => {
  state.pagination.pageSize = pageSize
  getPlanApplyListData()
}

// 分页当前页改变处理
const handleCurrentChange = (page: number) => {
  state.pagination.currentPage = page
  getPlanApplyListData()
}

const router = useRouter()

// 查看计划详情
const handleViewPlanDetail = (record: JointMarketingPlanApplyListRecord) => {
  router.push({
    path: '/merchantsAlliance/jointMarker/detail',
    query: { planId: record.id },
  })
}

// 申请加入计划
const handleJoinPlan = async (record: JointMarketingPlanApplyListRecord) => {
  try {
    if (!record.id) {
      ElMessage.error('计划ID不能为空')
      return
    }

    await joinPlanApply(record.id)
    ElMessage.success('申请加入计划成功')
    await getPlanApplyListData()
  } catch (error) {
    ElMessage.error('申请加入计划失败')
    console.error(error)
  }
}

onMounted(() => {
  getPlanApplyListData()
})
</script>

<style scoped lang="scss"></style>
