<template>
  <div class="flex flex-col gap4 p4 h-[calc(100vh-85px)]">
    <!-- 查询条件 -->
    <el-card v-if="state.showSearch">
      <el-form ref="queryRef" :inline="true" :model="state.searchForm" size="small">
        <el-form-item label="审核状态" prop="auditStatuses">
          <el-select v-model="state.searchForm.auditStatuses" placeholder="请选择审核状态" multiple>
            <el-option v-for="(item, index) in audit_statuses" :key="index" :label="item.label" :value="item.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="审核类型" prop="auditTypes">
          <el-select v-model="state.searchForm.auditTypes" placeholder="请选择审核类型" multiple>
            <el-option v-for="(item, index) in audit_type" :key="index" :label="item.label" :value="item.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="排序" prop="orderByCreateTime">
          <el-select v-model="state.searchForm.orderByCreateTime" placeholder="请选择排序">
            <el-option :value="true" label="按创建时间升序" />
            <el-option :value="false" label="按创建时间降序" />
          </el-select>
        </el-form-item>
        <el-form-item label="查询时间范围" prop="searchDateRange">
          <el-date-picker
            v-model="state.searchForm.searchDateRange"
            end-placeholder="结束日期"
            range-separator="至"
            start-placeholder="开始日期"
            style="width: 250px"
            type="daterange"
            value-format="YYYY-MM-DD"
          />
        </el-form-item>
        <el-form-item>
          <el-button icon="Search" type="primary" @click="getAuditListData">查询</el-button>
          <el-button icon="Refresh" @click="resetQuery">重置</el-button>
        </el-form-item>
      </el-form>
    </el-card>
    <!-- 审核列表 -->
    <el-card
      body-class="flex-1 flex flex-col overflow-auto"
      class="flex-1 flex flex-col"
      footer-class="py-0 mb-2"
      header-class="el-card__header"
    >
      <!-- 工具栏 -->
      <template #header>
        <right-toolbar
          v-model:show-search="state.showSearch"
          class="flex flex-row justify-end"
          @queryTable="getAuditListData"
        />
      </template>

      <!-- 表格 -->
      <el-table
        v-loading="state.loading"
        :cell-style="{ textAlign: 'center' }"
        :data="state.auditList"
        :header-cell-style="{ textAlign: 'center' }"
        class="h-full"
        style="width: 100%"
        border
      >
        <el-table-column label="审核ID" prop="auditId" width="120" />

        <el-table-column label="审核类型" prop="auditType" width="100" show-overflow-tooltip>
          <template #default="scope">
            <el-tag :type="auditTypes.textColor[scope.row.auditType]">
              {{ auditTypes.textMap[scope.row.auditType] }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="提交时间" prop="createdTime" width="180" />
        <el-table-column label="修改原因" min-width="200" prop="modifyReason" />
        <el-table-column label="审核时间" prop="auditTime" width="180" />
        <el-table-column label="审核状态" prop="auditStatus" width="100" show-overflow-tooltip>
          <template #default="scope">
            <el-tag :type="auditStatuses.textColor[scope.row.auditStatus]">
              {{ auditStatuses.textMap[scope.row.auditStatus] }}
            </el-tag>
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
  </div>
</template>

<script setup lang="ts">
import { AuditListRecords, AuditListRequest, AuditListResponse } from '/@/api/merchantsAlliance/merchant/types'
import { getAuditList } from '/@/api/merchantsAlliance/merchant/maintain'
import { ElMessage } from 'element-plus'
import { useDict } from '/@/hooks/dict'

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

const state = reactive({
  showSearch: true,
  searchForm: {
    auditStatuses: [],
    auditTypes: [],
    searchDateRange: [],
    orderByCreateTime: false as boolean,
  },
  auditList: [] as AuditListRecords[],
  pagination: {
    currentPage: 1,
    pageSize: 10,
    total: 0,
  },
  loading: false,
})

// 获取审核列表数据
async function getAuditListData() {
  state.loading = true
  try {
    const query = {
      ...state.searchForm,
      pageNum: state.pagination.currentPage,
      pageSize: state.pagination.pageSize,
      startDate: state.searchForm.searchDateRange[0] ? state.searchForm.searchDateRange[0] : undefined,
      endDate: state.searchForm.searchDateRange[1] ? state.searchForm.searchDateRange[1] : undefined,
    } as AuditListRequest
    const res = await getAuditList(query)
    const data = res.data as AuditListResponse
    state.auditList = data.records as AuditListRecords[]
    state.pagination = {
      currentPage: data.current || 1,
      pageSize: data.size || 10,
      total: data.total || 0,
    }
  } catch (error) {
    ElMessage.error('获取审核列表失败')
  } finally {
    state.loading = false
  }
}

// 重置查询条件
const resetQuery = () => {
  state.searchForm = {
    auditStatuses: [],
    auditTypes: [],
    searchDateRange: [],
    orderByCreateTime: false as boolean,
  }
  state.pagination = {
    currentPage: 1,
    pageSize: 10,
    total: 0,
  }
  getAuditListData()
}

// 分页大小改变处理
const handleSizeChange = (pageSize: number) => {
  state.pagination.pageSize = pageSize
  getAuditListData()
}
// 分页当前页改变处理
const handleCurrentChange = (page: number) => {
  state.pagination.currentPage = page
  getAuditListData()
}

onMounted(() => {
  getAuditListData()
})
</script>

<style scoped lang="scss"></style>
