<template>
  <div class="flex flex-col gap4 p4 h-[calc(100vh-85px)]">
    <!-- 查询条件 -->
    <el-card v-if="state.showSearch">
      <el-form ref="queryRef" :inline="true" :model="state.searchForm" size="small">
        <el-form-item label="计划名称" prop="planName">
          <el-input v-model="state.searchForm.planName" placeholder="请输入计划名称" style="width: 200px" />
        </el-form-item>
        <el-form-item label="邀请状态" prop="status">
          <el-select v-model="state.searchForm.status" placeholder="请选择邀请状态">
            <el-option label="全部" value="" />
            <el-option label="待处理" value="PENDING" />
            <el-option label="已接受" value="ACCEPTED" />
            <el-option label="已拒绝" value="REJECTED" />
            <el-option label="已过期" value="EXPIRED" />
          </el-select>
        </el-form-item>
        <el-form-item label="邀请时间范围" prop="inviteDateRange">
          <el-date-picker
            v-model="state.searchForm.inviteDateRange"
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
        <el-form-item>
          <el-button icon="Search" type="primary" @click="getInviteRecordListData">查询</el-button>
          <el-button icon="Refresh" @click="resetQuery">重置</el-button>
        </el-form-item>
      </el-form>
    </el-card>
    <!-- 收到的邀请记录列表 -->
    <el-card
      body-class="flex-1 flex flex-col overflow-auto"
      class="flex-1 flex flex-col"
      footer-class="py-0 mb-2"
      header-class="el-card__header"
    >
      <!-- 工具栏 -->
      <template #header>
        <div class="flex flex-row justify-between items-center">
          <span class="text-xl font-bold">收到的邀请记录</span>
          <right-toolbar
            v-model:show-search="state.showSearch"
            class="flex flex-row justify-end"
            @queryTable="getInviteRecordListData"
          />
        </div>
      </template>

      <!-- 表格 -->
      <el-table
        v-loading="state.loading"
        :cell-style="{ textAlign: 'center' }"
        :data="state.inviteList"
        :header-cell-style="{ textAlign: 'center' }"
        class="h-full"
        style="width: 100%"
        border
      >
        <el-table-column label="计划ID" prop="planId" width="120" />
        <el-table-column label="计划名称" min-width="180" prop="planName" show-overflow-tooltip />
        <el-table-column label="计划状态" prop="planStatus" width="100" show-overflow-tooltip>
          <template #default="scope">
            <el-tag :type="getPlanStatusColor(scope.row.planStatus)">
              {{ getPlanStatusLabel(scope.row.planStatus) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="计划开始时间" prop="planStartTime" width="180" />
        <el-table-column label="计划结束时间" prop="planEndTime" width="180" />
        <el-table-column label="邀请商户" min-width="180" prop="merchantName" show-overflow-tooltip />
        <el-table-column label="邀请时间" prop="inviteTime" width="180" />
        <el-table-column label="邀请状态" prop="participantStatus" width="100" show-overflow-tooltip>
          <template #default="scope">
            <el-tag :type="getInviteStatusColor(scope.row.participantStatus)">
              {{ getInviteStatusLabel(scope.row.participantStatus) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="200" fixed="right">
          <template #default="scope">
            <el-button
              v-if="scope.row.participantStatus === 'PENDING'"
              size="small"
              type="success"
              text
              @click="handleAcceptInvite(scope.row)"
            >
              接受邀请
            </el-button>
            <el-button
              v-if="scope.row.participantStatus === 'PENDING'"
              size="small"
              type="danger"
              text
              @click="handleRejectInvite(scope.row)"
            >
              拒绝邀请
            </el-button>
            <el-button size="small" type="primary" text @click="handleViewPlanDetail(scope.row)">
              查看计划详情
            </el-button>
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
  JointMarketingInviteListRequest,
  JointMarketingInviteListResponse,
  JointMarketingInviteListRecord,
} from '/@/api/merchantsAlliance/jointMarket/types'
import { getInviteRecordList, acceptParticipant, rejectParticipant } from '/@/api/merchantsAlliance/jointMarket'
import { ElMessage } from 'element-plus'
import { onMounted, reactive } from 'vue'
import { useRouter } from 'vue-router'

// 计划状态映射
const planStatusMap = {
  NOT_STARTED: { label: '未开始', color: 'info' },
  IN_PROGRESS: { label: '进行中', color: 'success' },
  ENDED: { label: '已结束', color: 'danger' },
  CLOSED: { label: '已关闭', color: 'warning' },
} as Record<string, Record<string, string>>

// 邀请状态映射
const inviteStatusMap = {
  PENDING: { label: '待处理', color: 'warning' },
  ACCEPTED: { label: '已接受', color: 'success' },
  REJECTED: { label: '已拒绝', color: 'danger' },
  EXPIRED: { label: '已过期', color: 'info' },
} as Record<string, Record<string, string>>

// 获取计划状态标签
const getPlanStatusLabel = (status: string) => {
  return planStatusMap[status]?.label || status
}

// 获取计划状态颜色
const getPlanStatusColor = (status: string) => {
  return planStatusMap[status]?.color || 'info'
}

// 获取邀请状态标签
const getInviteStatusLabel = (status: string) => {
  return inviteStatusMap[status]?.label || status
}

// 获取邀请状态颜色
const getInviteStatusColor = (status: string) => {
  return inviteStatusMap[status]?.color || 'info'
}

const state = reactive({
  /** 搜索表单 */
  showSearch: true,
  searchForm: {
    planName: '',
    status: '',
    inviteDateRange: [],
    acceptDateRange: [],
  },
  inviteList: [] as JointMarketingInviteListRecord[],
  pagination: {
    currentPage: 1,
    pageSize: 10,
    total: 0,
  },
  loading: false,
})

// 获取邀请记录列表数据
async function getInviteRecordListData() {
  state.loading = true
  try {
    // 处理日期范围
    const [inviteStartDate, inviteEndDate] = state.searchForm.inviteDateRange || []
    const [acceptStartDate, acceptEndDate] = state.searchForm.acceptDateRange || []

    const query = {
      pageNum: state.pagination.currentPage,
      pageSize: state.pagination.pageSize,
      status: state.searchForm.status,
      inviteStartDate: inviteStartDate || '',
      inviteEndDate: inviteEndDate || '',
      acceptStartDate: acceptStartDate || '',
      acceptEndDate: acceptEndDate || '',
    } as JointMarketingInviteListRequest

    // 如果需要根据计划名称过滤，可以在这里处理
    const res = await getInviteRecordList(query)
    const data = res.data as JointMarketingInviteListResponse

    // 过滤计划名称
    let filteredRecords = data.records || []
    if (state.searchForm.planName) {
      filteredRecords = filteredRecords.filter((record) => record.planName?.includes(state.searchForm.planName!))
    }

    state.inviteList = filteredRecords
    state.pagination = {
      currentPage: data.current || 1,
      pageSize: data.size || 10,
      total: data.total || 0,
    }
  } catch (error) {
    ElMessage.error('获取邀请记录列表失败')
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
    inviteDateRange: [],
    acceptDateRange: [],
  }
  state.pagination = {
    currentPage: 1,
    pageSize: 10,
    total: 0,
  }
  getInviteRecordListData()
}

// 分页大小改变处理
const handleSizeChange = (pageSize: number) => {
  state.pagination.pageSize = pageSize
  getInviteRecordListData()
}

// 分页当前页改变处理
const handleCurrentChange = (page: number) => {
  state.pagination.currentPage = page
  getInviteRecordListData()
}

const router = useRouter()

// 查看计划详情
const handleViewPlanDetail = (record: JointMarketingInviteListRecord) => {
  router.push({
    path: '/merchantsAlliance/jointMarker/detail',
    query: { planId: record.planId },
  })
}

// 接受邀请
const handleAcceptInvite = async (record: JointMarketingInviteListRecord) => {
  try {
    if (!record.participantId) {
      ElMessage.error('邀请ID不能为空')
      return
    }
    await acceptParticipant(record.participantId)
    ElMessage.success('接受邀请成功')
    await getInviteRecordListData()
  } catch (error) {
    ElMessage.error('接受邀请失败')
    console.error(error)
  }
}

// 拒绝邀请
const handleRejectInvite = async (record: JointMarketingInviteListRecord) => {
  try {
    if (!record.participantId) {
      ElMessage.error('邀请ID不能为空')
      return
    }
    await rejectParticipant(record.participantId)
    ElMessage.success('拒绝邀请成功')
    await getInviteRecordListData()
  } catch (error) {
    ElMessage.error('拒绝邀请失败')
    console.error(error)
  }
}

onMounted(() => {
  getInviteRecordListData()
})
</script>

<style scoped lang="scss"></style>
