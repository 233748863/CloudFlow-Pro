<template>
  <div class="flex flex-col gap4 p4 h-[calc(100vh-85px)]">
    <!-- 搜索筛选区域 -->
    <el-card v-if="state.showSearch">
      <el-form :inline="true" :model="data.searchForm" size="small">
        <el-form-item label="订单ID">
          <el-input v-model="data.searchForm.orderId" placeholder="请输订单ID" style="width: 200px" />
        </el-form-item>
        <el-form-item label="订单号">
          <el-input v-model="data.searchForm.orderNo" placeholder="请输入订单号" style="width: 200px" />
        </el-form-item>
        <el-form-item label="退款单号">
          <el-input v-model="data.searchForm.refundNo" placeholder="请输入退款单号" style="width: 200px" />
        </el-form-item>

        <el-form-item label="订单状态">
          <el-select v-model="data.searchForm.status" placeholder="请选择订单状态" style="width: 200px">
            <el-option v-for="(item, index) in OrderStatus" :key="index" :label="item.label" :value="item.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="退款类型">
          <el-select v-model="data.searchForm.refundType" placeholder="请选择退款类型" style="width: 200px">
            <el-option v-for="(item, index) in RefundType" :key="index" :label="item.label" :value="item.value" />
          </el-select>
        </el-form-item>

        <el-form-item label="查询时间范围">
          <el-date-picker
            v-model="data.searchForm.searchDateRange"
            end-placeholder="结束日期"
            range-separator="至"
            start-placeholder="开始日期"
            style="width: 200px"
            type="daterange"
            value-format="YYYY-MM-DD"
          />
        </el-form-item>
        <el-form-item>
          <el-button :v-auth="'merchant_order_view'" icon="Search" type="primary" @click="handleSearch">搜索</el-button>
          <el-button icon="Refresh" @click="handleReset">重置</el-button>
        </el-form-item>
      </el-form>
    </el-card>
    <!-- 订单列表区域 -->
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
          class="ml10"
          style="float: right; margin-right: 20px"
          @queryTable="handleSearch"
        />
      </template>

      <!-- 订单列表区域 -->
      <el-table
        v-loading="state.loading"
        :cell-style="() => ({ textAlign: 'center' })"
        :data="data.refundOrders"
        :header-cell-style="() => ({ textAlign: 'center' })"
        class="h-full"
        style="width: 100%"
        border
      >
        <!-- 订单ID -->
        <el-table-column label="退款单ID" prop="id" width="120" />
        <!-- 退款单号 -->
        <el-table-column label="退款单号" prop="refundNo" width="200" />
        <!-- 订单号 -->
        <el-table-column label="订单号" prop="orderNo" width="200" />
        <!-- 退款类型 -->
        <el-table-column label="退款类型" prop="refundType" width="120">
          <template #default="scope">
            <el-tag :type="RefundType.find((item:any) => item.value === scope.row.refundType)?.type || 'danger'">
              {{ RefundType.find((item: any) => item.value === scope.row.refundType)?.label || '-' }}
            </el-tag>
          </template>
        </el-table-column>
        <!-- 退款状态 -->
        <el-table-column label="退款状态" prop="status" width="120">
          <template #default="scope">
            <el-tag :type="OrderStatus.find((item:any) => item.value === scope.row.status)?.type || 'danger'">
              {{ scope.row.statusDescription || '-' }}
            </el-tag>
          </template>
        </el-table-column>
        <!-- 退款金额 -->
        <el-table-column label="退款金额" prop="refundAmount" width="120" />
        <!-- 创建时间 -->
        <el-table-column label="创建时间" prop="createTime" width="200" />
        <!-- 退款原因 -->
        <el-table-column label="退款原因" prop="refundReason" width="150" />
        <!-- 审核时间 -->
        <el-table-column label="审核时间" prop="auditTime" width="200" />
        <!-- 审核备注 -->
        <el-table-column label="审核备注" prop="auditRemark" width="150" show-overflow-tooltip />
        <!-- 退款时间 -->
        <el-table-column label="退款时间" prop="refundTime" width="200" />
        <!-- 更新时间 -->
        <el-table-column label="更新时间" prop="updateTime" width="200" />
        <!-- 操作 -->
        <el-table-column fixed="right" label="操作" width="180">
          <template #default="scope">
            <el-button
              v-if="scope.row.status === 'PENDING'"
              size="small"
              type="primary"
              text
              @click="handleAudit(scope.row)"
            >
              处理
            </el-button>
            <el-button
              :v-auth="'merchant_order_view'"
              size="small"
              type="success"
              text
              @click="handleRefundDetail(scope.row)"
            >
              查看详情
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <!-- 分页 -->
      <template #footer>
        <el-pagination
          v-model:current-page="data.pagination.currentPage"
          v-model:page-size="data.pagination.pageSize"
          :page-sizes="[10, 20, 50, 100]"
          :total="data.pagination.total"
          layout="total, sizes, prev, pager, next, jumper"
          @current-change="handleCurrentChange"
          @size-change="handleSizeChange"
        />
      </template>
    </el-card>
    <!-- 订单退款抽屉 -->
    <refund-drawer
      v-model:is-show="state.isRefundDrawerShow"
      :refund-apply-id="data.refundApplyId"
      @error="state.isRefundDrawerShow = false"
      @success="handleAuditSuccess"
    />
  </div>
</template>

<script setup lang="ts">
import { getRefundList } from '/@/api/merchantsAlliance/order'
import { RefundListRequest, RefundListResponse, RefundOrderItem } from '/@/api/merchantsAlliance/order/types'
import refundDrawer from '/@/views/merchantsAlliance/order/refundDrawer.vue'

// 订单状态
const OrderStatus = [
  { value: '', label: '全部' },
  { value: 'PENDING', label: '待审核', type: 'primary' },
  { value: 'APPROVED', label: '已通过', type: 'success' },
  { value: 'REJECTED', label: '已拒绝', type: 'danger' },
  { value: 'REFUNDED', label: '已退款', type: 'info' },
] as { value: string; label: string; type?: string }[]

// 退款状态
const RefundType = [
  { value: '', label: '全部' },
  { value: 'FULL', label: '全额退款', type: 'primary' },
  { value: 'PARTIAL', label: '部分退款', type: 'warning' },
] as { value: string; label: string; type?: string }[]

// 订单数据管理
const data = reactive({
  // 搜索表单数据
  searchForm: {
    orderId: '',
    orderNo: '',
    refundNo: '',
    status: '',
    refundType: '',
    startTime: '',
    endTime: '',
    searchDateRange: [],
  },
  // 订单列表
  refundOrders: [] as RefundOrderItem[],
  // 分页数据
  pagination: {
    currentPage: 1,
    pageSize: 10,
    total: 0,
  },
  refundApplyId: undefined as undefined | string,
})

// 状态管理
const state = reactive({
  // 显示搜索筛选区域
  showSearch: true,
  loading: false,
  isRefundDrawerShow: false,
})

// 处理搜索
async function handleSearch() {
  try {
    state.loading = true
    const query = {
      orderId: data.searchForm.orderId ?? undefined,
      orderNo: data.searchForm.orderNo ?? undefined,
      refundNo: data.searchForm.refundNo ?? undefined,
      status: data.searchForm.status ?? undefined,
      refundType: data.searchForm.refundType ?? undefined,
      startTime: data.searchForm.searchDateRange[0] ? data.searchForm.searchDateRange[0] + ' 00:00:00' : undefined,
      endTime: data.searchForm.searchDateRange[1] ? data.searchForm.searchDateRange[1] + ' 23:59:59' : undefined,
      current: data.pagination.currentPage,
      size: data.pagination.pageSize,
    } as RefundListRequest
    const res = await getRefundList(query)
    if (res.code === 0) {
      const { records, total } = res.data as RefundListResponse
      data.refundOrders = records
      data.pagination.total = total
    }
  } catch (error) {
    console.error('搜索订单列表失败:', error)
  } finally {
    state.loading = false
  }
}

// 处理重置
function handleReset() {
  data.searchForm = {
    orderId: '',
    orderNo: '',
    refundNo: '',
    status: '',
    refundType: '',
    startTime: '',
    endTime: '',
    searchDateRange: [],
  }
  handleSearch()
}

// 处理分页当前页变化
function handleCurrentChange(newVal: number) {
  data.pagination.currentPage = newVal
  handleSearch()
}

// 处理分页每页数量变化
function handleSizeChange(newVal: number) {
  data.pagination.pageSize = newVal
  handleSearch()
}

// 处理审核
function handleAudit(order: RefundOrderItem) {
  data.refundApplyId = order.id
  state.isRefundDrawerShow = true
}

//
function handleRefundDetail(order: RefundOrderItem) {
  data.refundApplyId = order.id
  state.isRefundDrawerShow = true
}

function handleAuditSuccess() {
  handleSearch()
}

onMounted(() => {
  handleSearch()
})
</script>

<style scoped lang="scss">
:deep(.el-card__header) {
  padding: 5px 20px !important;
}
</style>
