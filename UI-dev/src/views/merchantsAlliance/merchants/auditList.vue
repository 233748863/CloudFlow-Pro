<template>
  <div class="flex flex-col gap4 p4 h-[calc(100vh-85px)]">
    <!-- 搜索条件 -->
    <el-card v-show="showSearch">
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
            <el-option :value="false" label="按创建时间降序" />
            <el-option :value="true" label="按创建时间升序" />
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
          <el-button icon="Search" type="primary" @click="getDataList">查询</el-button>
          <el-button icon="Refresh" @click="resetQuery">重置</el-button>
        </el-form-item>
      </el-form>
    </el-card>
    <!-- 表格 -->
    <el-card
      body-class="flex-1 flex flex-col overflow-auto"
      class="flex-1 flex flex-col"
      footer-class="py-0 mb-2"
      header-class="el-card__header"
    >
      <!-- 工具栏 -->
      <template #header>
        <right-toolbar v-model:show-search="showSearch" class="flex flex-row justify-end" @queryTable="getDataList" />
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
        <el-table-column label="审核ID" prop="auditId" width="80" />
        <el-table-column label="商家名称" prop="merchantName" width="150" show-overflow-tooltip />
        <el-table-column label="logo" prop="logoUrl" width="80" show-overflow-tooltip>
          <template #default="scope">
            <el-image
              v-if="scope.row.logoUrl"
              :preview-src-list="[getImageUrl(scope.row.logoUrl)]"
              :preview-teleported="true"
              :src="getImageUrl(scope.row.logoUrl)"
              fit="cover"
              style="width: 50px; height: 50px"
            />
          </template>
        </el-table-column>
        <el-table-column label="联系人姓名" prop="contactName" width="100" show-overflow-tooltip />
        <el-table-column label="联系人手机号" prop="contactPhone" width="150" show-overflow-tooltip />
        <el-table-column label="商家地址" min-width="200" prop="addressDetail" show-overflow-tooltip />
        <el-table-column label="商家状态" prop="businessStatus" width="100" show-overflow-tooltip>
          <template #default="scope">
            <el-tag :type="businessAuditTypes.textColor[scope.row.businessStatus]">
              {{ businessAuditTypes.textMap[scope.row.businessStatus] }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="审核状态" prop="auditStatus" width="100" show-overflow-tooltip>
          <template #default="scope">
            <el-tag :type="auditStatuses.textColor[scope.row.auditStatus]">
              {{ auditStatuses.textMap[scope.row.auditStatus] }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="审核类型" prop="auditType" width="100" show-overflow-tooltip>
          <template #default="scope">
            <el-tag :type="auditTypes.textColor[scope.row.auditType]">
              {{ auditTypes.textMap[scope.row.auditType] }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="创建时间" prop="createdTime" width="180" show-overflow-tooltip />
        <el-table-column fixed="right" label="操作" width="150">
          <template #default="scope">
            <el-button
              v-if="scope.row.auditStatus === 'PENDING'"
              :v-aut="'platform_merchant_info'"
              size="small"
              type="primary"
              link
              @click="handleAuditAction(scope.row)"
            >
              处理
            </el-button>
            <el-button
              v-else
              :v-aut="'platform_merchant_info'"
              size="small"
              type="success"
              link
              @click="handleAuditAction(scope.row)"
            >
              查看审核详情
            </el-button>
          </template>
        </el-table-column>
      </el-table>

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
    <!-- 审核详情抽屉 -->
    <audit-drawer
      v-model:is-show="state.showAuditDrawer"
      :audit-id="state.auditId"
      @error="state.showAuditDrawer = false"
      @success="getDataList"
    />
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { getMerchantAuditList } from '/@/api/merchantsAlliance/merchant/merchant'
import {
  MerchantAuditHandleRequest,
  MerchantAuditListRecords,
  MerchantAuditListRequest,
  MerchantAuditListResponse,
} from '/@/api/merchantsAlliance/merchant/types'
import { useDict } from '/@/hooks/dict'
import { ElMessage } from 'element-plus'
import AuditDrawer from '/@/views/merchantsAlliance/merchants/auditDrawer.vue'
import { getImageUrl } from '/@/views/merchantsAlliance/way'
const { audit_statuses, audit_type, merchant_audit_type } = useDict(
  'audit_statuses',
  'audit_type',
  'merchant_audit_type'
)
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

const state = reactive({
  // 是否加载中
  loading: false,
  // 审核列表数据
  auditList: [] as MerchantAuditListRecords[],
  // 搜索表单
  searchForm: {
    auditStatuses: [],
    auditTypes: [],
    searchDateRange: [],
    orderByCreateTime: false as boolean,
  },
  // 审核表单
  auditForm: {} as MerchantAuditHandleRequest,
  // 分页信息
  pagination: {
    currentPage: 1,
    pageSize: 10,
    total: 0,
  },
  // 抽屉是否显示
  showAuditDrawer: false,
  auditId: null as string | null,
})

// 搜索框显示状态
const showSearch = ref(true)
// 查询表单引用
const queryRef = ref<any>(null)

// 处理分页每页条数改变
const handleSizeChange = (pageSize: number) => {
  state.pagination.pageSize = pageSize
  getDataList()
}
// 处理分页当前页改变
const handleCurrentChange = (page: number) => {
  state.pagination.currentPage = page
  getDataList()
}

// 获取数据列表
const getDataList = async () => {
  try {
    state.loading = true
    const query = {
      ...state.searchForm,
      startDate: state.searchForm.searchDateRange[0] ? state.searchForm.searchDateRange[0] : undefined,
      endDate: state.searchForm.searchDateRange[1] ? state.searchForm.searchDateRange[1] : undefined,
      pageNum: state.pagination.currentPage,
      pageSize: state.pagination.pageSize,
    } as MerchantAuditListRequest
    const response = await getMerchantAuditList(query)
    const data = response.data as MerchantAuditListResponse
    state.auditList = data.records
    state.pagination = {
      currentPage: data.current,
      pageSize: data.size,
      total: data.total,
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
  getDataList()
}

// 处理审核操作
const handleAuditAction = async (row: any) => {
  state.showAuditDrawer = true
  state.auditId = row.auditId
}

// 在组件挂载时确保数据被加载
onMounted(() => {
  getDataList()
})
</script>

<style scoped lang="scss">
:deep(.el-card__header) {
  padding: 5px 20px !important;
}
</style>
