<template>
  <div class="flex flex-col gap4 p4 h-[calc(100vh-85px)]">
    <!-- 搜索栏 -->
    <el-card v-show="state.showSearch">
      <el-form :inline="true" :model="state.searchForm" size="small">
        <el-form-item label="商家" prop="merchantId">
          <el-select
            v-model="state.searchForm.merchantId"
            :loading="state.loadingMerchant"
            :remote-method="localSearchMerchant"
            placeholder="请选择商家"
            filterable
            remote
          >
            <el-option
              v-for="item in state.merchants"
              :key="item.merchantId"
              :label="item.merchantName"
              :value="item.merchantId"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="店铺名称" prop="name">
          <el-input v-model="state.searchForm.name" placeholder="请输入店铺名称" />
        </el-form-item>
        <el-form-item label="行业" prop="industryIds">
          <el-select
            v-model="state.searchForm.industryIds"
            :loading="state.loadingIndustry"
            :remote-method="loadIndustryList"
            placeholder="请选择行业"
            filterable
            multiple
            remote
          >
            <el-option v-for="(item, index) in industryList" :key="index" :label="item.name" :value="item.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="审核类型" prop="auditTypes">
          <el-select v-model="state.searchForm.auditTypes" placeholder="请选择审核类型" multiple>
            <el-option v-for="(value, key) in STORE_AUDIT_TYPES" :key="key" :label="value" :value="key" />
          </el-select>
        </el-form-item>
        <el-form-item label="审核状态" prop="auditStatuses">
          <el-select v-model="state.searchForm.auditStatuses" placeholder="请选择审核状态" multiple>
            <el-option v-for="(value, key) in STORE_AUDIT_STATUSES" :key="key" :label="value" :value="key" />
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
        <el-form-item label="排序" prop="orderByCreateTime">
          <el-select v-model="state.searchForm.orderByCreateTime">
            <el-option :value="true" label="按提交时间升序" />
            <el-option :value="false" label="按提交时间降序" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button icon="Search" type="primary" @click="handleSearch">查询</el-button>
          <el-button icon="Refresh" @click="handleReset">重置</el-button>
        </el-form-item>
      </el-form>
    </el-card>
    <!-- 审核记录列表 -->
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
          @queryTable="handleSearch"
        />
      </template>

      <!-- 表格 -->
      <el-table
        v-loading="state.loading"
        :cell-style="() => ({ textAlign: 'center' })"
        :data="state.storeAuditList"
        :header-cell-style="() => ({ textAlign: 'center' })"
        class="h-full"
        style="width: 100%"
        border
      >
        <el-table-column label="审核ID" prop="auditId" width="80" />
        <el-table-column label="Logo" prop="logoUrl" width="100">
          <template #default="scope">
            <el-image
              :preview-src-list="[getImageUrl(scope.row.logoUrl)]"
              :preview-teleported="true"
              :src="getImageUrl(scope.row.logoUrl)"
              fit="cover"
              style="width: 60px; height: 60px"
            />
          </template>
        </el-table-column>
        <el-table-column label="店铺名称" prop="storeName" width="200" />
        <el-table-column label="行业" prop="industryName" width="120" />
        <el-table-column label="店铺地址" min-width="300" prop="addressDetail" />
        <el-table-column label="审核状态" prop="auditStatus" width="120">
          <template #default="scope">
            <el-tag :type="auditStatuses.textColor[scope.row.auditStatus]" size="small">
              {{ auditStatuses.textMap[scope.row.auditStatus] }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="审核类型" prop="auditType" width="120">
          <template #default="scope">
            <el-tag :type="auditTypes.textColor[scope.row.auditType]" size="small">
              {{ auditTypes.textMap[scope.row.auditType] }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="提交时间" prop="createdTime" width="200" />
        <el-table-column fixed="right" label="操作" width="180">
          <template #default="scope">
            <el-button
              v-if="scope.row.auditStatus === 'PENDING'"
              size="small"
              type="primary"
              text
              @click="handleAudit(scope.row.auditId)"
            >
              处理
            </el-button>
            <el-button v-else size="small" type="success" text @click="handleAudit(scope.row.auditId)">
              查看审核详情
            </el-button>
            <!--            <el-button size="small" type="info" text @click="handleStoreDetail(scope.row.auditId)">-->
            <!--              查看店铺详情-->
            <!--            </el-button>-->
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
    <!-- 审核处理抽屉 -->
    <audit-drawer v-model:is-show="state.isAuditDrawer" :audit-id="state.auditId" @success="handleSearch" />
    <!--    &lt;!&ndash; 店铺详情抽屉 &ndash;&gt;-->
    <!--    <store-details-drawer v-model:is-show="state.isStoreDetails" :audit-id="state.auditId"/>-->
  </div>
</template>

<script setup lang="ts">
import { getStoreAuditList } from '/@/api/merchantsAlliance/store/store'
import {
  PlatformIndustry,
  STORE_AUDIT_STATUSES,
  STORE_AUDIT_TYPES,
  StoreAudit,
  StoreAuditListRequest,
  StoreAuditResponse,
} from '/@/api/merchantsAlliance/store/types'
import { reactive } from 'vue'
import { useDict } from '/@/hooks/dict' // 字典钩子
import { ElMessage } from 'element-plus'
import AuditDrawer from '/@/views/merchantsAlliance/storeMaintain/auditDrawer.vue'
import { getImageUrl } from '/@/views/merchantsAlliance/way'
import { getIndustryList } from '/@/api/merchantsAlliance/platformIndustry'
import { getJointMarketingPlanMerchantList } from '/@/api/merchantsAlliance/merchant/merchant'
import { JointMarketingPlanMerchantListRecords } from '/@/api/merchantsAlliance/merchant/types'

const { audit_statuses } = useDict('audit_statuses') // 商家审核状态字典
const { audit_type } = useDict('audit_type') // 商家审核类型字典
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

// 商家店铺审核列表
const state = reactive({
  // 加载状态
  loading: false,
  // 是否显示搜索框
  showSearch: true,
  // 是否显示审核处理抽屉
  isAuditDrawer: false,
  // 是否显示店铺详情抽屉
  isStoreDetails: false,
  // 审核记录ID
  auditId: undefined as string | undefined,
  // 分页信息
  pagination: {
    currentPage: 1,
    pageSize: 10,
    total: 0,
  },
  storeAuditList: [] as StoreAudit[], // 商家店铺审核列表记录
  searchForm: {
    pageNum: 1, //页码
    pageSize: 10, //每页数量
    merchantId: null as string | null, //商家ID
    name: '', //店铺名称
    industryIds: [] as number[], //行业分类ID列表
    auditTypes: [] as number[], //审核类型列表
    auditStatuses: [] as string[], //审核状态列表
    orderByCreateTime: false, //是否按创建时间排序
    searchDateRange: [] as string[], //查询时间范围
    startDate: '', //开始日期
    endDate: '', //结束日期
  },
  // 行业列表加载状态
  loadingIndustry: false,
  // 商家列表加载状态
  loadingMerchant: false,
  // 商家列表
  merchants: [] as JointMarketingPlanMerchantListRecords[],
})
// 行业列表
const industryList = ref<PlatformIndustry[]>([])
// 加载行业列表
const loadIndustryList = async (name?: string) => {
  try {
    state.loadingIndustry = true
    const response = await getIndustryList({ name: name || '', page: 1, pageSize: 20 })
    industryList.value = response.data.records || ([] as PlatformIndustry[])
  } catch (err) {
    ElMessage.error('获取行业列表失败')
  } finally {
    state.loadingIndustry = false
  }
}

// 本地搜索商家
async function localSearchMerchant(queryString: string) {
  state.loadingMerchant = true
  try {
    const res = await getJointMarketingPlanMerchantList({
      pageNum: 1,
      pageSize: 10,
      merchantName: queryString,
    })
    if (res.code === 0) {
      state.merchants = res.data.records || []
    }
  } catch (e) {
    ElMessage.error('查询失败')
  }
  state.loadingMerchant = false
}

// 搜索
const handleSearch = async () => {
  state.loading = true
  try {
    // 合并分页参数
    state.searchForm.pageNum = state.pagination.currentPage
    state.searchForm.pageSize = state.pagination.pageSize
    const query = {
      pageNum: state.pagination.currentPage,
      pageSize: state.pagination.pageSize,
      merchantId: state.searchForm.merchantId,
      name: state.searchForm.name,
      industryIds: state.searchForm.industryIds,
      auditTypes: state.searchForm.auditTypes,
      auditStatuses: state.searchForm.auditStatuses,
      orderByCreateTime: state.searchForm.orderByCreateTime,
      startDate: state.searchForm.searchDateRange[0] ? state.searchForm.searchDateRange[0] : '',
      endDate: state.searchForm.searchDateRange[1] ? state.searchForm.searchDateRange[1] : '',
    } as StoreAuditListRequest

    const response = await getStoreAuditList(query)
    const data = response.data as StoreAuditResponse
    state.storeAuditList = data?.records || []
    state.pagination.total = data?.total || 0
    state.pagination.pageSize = data?.size || 0
    state.pagination.currentPage = data?.current || 0
  } catch (err) {
    ElMessage.error('获取商家店铺审核列表失败')
  } finally {
    state.loading = false
  }
}

// 重置
const handleReset = () => {
  Object.assign(state.searchForm, {})
  // 重置分页参数
  state.pagination.currentPage = 1
  state.pagination.pageSize = 10
  state.pagination.total = 0
  handleSearch()
}
// 分页 - 当前页改变
const handleCurrentChange = (val: number) => {
  state.pagination.currentPage = val
  handleSearch()
}
// 分页 - 每页条数改变
const handleSizeChange = (val: number) => {
  state.pagination.pageSize = val
  handleSearch()
}
// 处理审核
const handleAudit = (auditId: string) => {
  state.auditId = auditId
  state.isAuditDrawer = true
}
// 处理店铺详情
// const handleStoreDetail = (auditId: string) => {
//   state.auditId = auditId
//   state.isStoreDetails = true
// }

onMounted(() => {
  handleReset()
})
</script>

<style scoped lang="scss">
:deep(.el-card__header) {
  padding: 5px 20px !important;
}
</style>
