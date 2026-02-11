<template>
  <div class="flex flex-col gap4 p4 h-[calc(100vh-85px)]">
    <!-- 搜索筛选区域 -->
    <el-card v-if="state.showSearch">
      <el-form :inline="true" :model="data.searchForm" size="small">
        <el-form-item label="门店ID">
          <el-input v-model="data.searchForm.storeId" placeholder="请输入门店ID" style="width: 200px" />
        </el-form-item>
        <el-form-item label="订单号">
          <el-input v-model="data.searchForm.orderNo" placeholder="请输入订单号" style="width: 200px" />
        </el-form-item>
        <el-form-item label="订单状态">
          <el-select v-model="data.searchForm.status" placeholder="请选择订单状态" style="width: 200px">
            <el-option
              v-for="(item, index) in order_type.filter((item: any) => item.value !== 'REFUNDING')"
              :key="index"
              :label="item.label"
              :value="item.value"
            />
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
        <!--        <el-button :v-auth="'merchant_order_create'" type="primary" @click="handleAdd">新建订单</el-button>-->
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
        :data="data.orders"
        :header-cell-style="() => ({ textAlign: 'center' })"
        class="h-full"
        style="width: 100%"
        border
      >
        <!-- 订单id -->
        <el-table-column label="订单ID" prop="id" width="120" />
        <!-- 订单号 -->
        <el-table-column label="订单号" prop="orderNo" width="200" />
        <!-- 门店名称 -->
        <el-table-column label="门店名称" prop="storeName" width="200" />
        <!-- 订单状态 -->
        <el-table-column label="订单状态" prop="status" width="150">
          <template #default="scope">
            <el-tag :type="getOrderStatusTagType[scope.row.status]">
              {{ getOrderStatusText[scope.row.status] }}
            </el-tag>
          </template>
        </el-table-column>
        <!-- 订单金额 -->
        <el-table-column label="订单金额" prop="orderAmount" width="150" />
        <!-- 优惠金额 -->
        <el-table-column label="优惠金额" prop="discountAmount" width="150" />
        <!-- 实付金额 -->
        <el-table-column label="实付金额" prop="payAmount" width="150" />
        <!-- 支付方式 -->
        <el-table-column label="支付方式" prop="payMethodDesc" width="150" />
        <!-- 支付时间 -->
        <el-table-column label="支付时间" prop="payTime" width="200" />
        <!-- 核销码 -->
        <el-table-column label="核销码" prop="verifyCode" width="150" />
        <!-- 核销时间 -->
        <el-table-column label="核销时间" prop="verifyTime" width="200" />
        <!-- 订单备注 -->
        <el-table-column label="订单备注" prop="remark" width="200" />
        <!-- 创建时间 -->
        <el-table-column label="创建时间" prop="createTime" width="200" />
        <!-- 修改时间 -->
        <el-table-column label="修改时间" prop="updateTime" width="200" />
        <!-- 操作 -->
        <el-table-column fixed="right" label="操作" width="180">
          <template #default="scope">
            <el-button
              v-if="scope.row.status === 'PENDING_DELIVERED' || scope.row.status === 'PENDING_DELIVERY'"
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
              @click="handleDetail(scope.row)"
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

    <!-- 订单核销抽屉 -->
    <verify-drawer
      v-model:is-show="state.isVerifyDrawerShow"
      :order-id="data.orderId"
      @error="state.isVerifyDrawerShow = false"
      @success="handleSearch"
    />

    <!-- 订单发货抽屉 -->
    <delivery-drawer
      v-model:is-show="state.isDeliveryDrawerShow"
      :order-id="data.orderId"
      @error="state.isDeliveryDrawerShow = false"
      @success="handleSearch"
    />

    <!-- 订单退款抽屉 -->
    <refund-drawer
      v-model:is-show="state.isRefundDrawerShow"
      :order-id="data.orderId"
      @error="state.isRefundDrawerShow = false"
    />

    <!-- 订单详情抽屉 -->
    <detail-drawer
      v-model:is-show="state.isDetailDrawerShow"
      :order-id="data.orderId"
      @error="state.isDetailDrawerShow = false"
    />
  </div>
</template>

<script setup lang="ts">
import { useDict } from '/@/hooks/dict'
import { createOrder, getOrderList } from '/@/api/merchantsAlliance/order'
import { OrderListItem, OrderListRequest, OrderListResponse } from '/@/api/merchantsAlliance/order/types'
import verifyDrawer from '/@/views/merchantsAlliance/order/verifyDrawer.vue'
import deliveryDrawer from '/@/views/merchantsAlliance/order/deliveryDrawer.vue'
import refundDrawer from '/@/views/merchantsAlliance/order/refundDrawer.vue'
import { ElMessage } from 'element-plus'
import DetailDrawer from '/@/views/merchantsAlliance/order/detailDrawer.vue'
import { generateSecureRandomString } from '/@/views/merchantsAlliance/way'

const { order_type } = useDict('order_type')
// 订单状态颜色映射
const getOrderStatusTagType = computed(() => {
  return order_type.value.reduce((prev: any, cur: any) => ({ ...prev, [cur.value]: cur.remarks }), {})
})
const getOrderStatusText = computed(() => {
  return order_type.value.reduce((prev: any, cur: any) => ({ ...prev, [cur.value]: cur.label }), {})
})
// 订单数据管理
const data = reactive({
  // 搜索表单数据
  searchForm: {
    storeId: '',
    status: '',
    searchDateRange: [],
    orderNo: '',
  },
  // 订单列表
  orders: [] as OrderListItem[],
  // 分页数据
  pagination: {
    currentPage: 1,
    pageSize: 10,
    total: 0,
  },
  orderId: undefined as undefined | number,
})

// 状态管理
const state = reactive({
  // 显示搜索筛选区域
  showSearch: true,
  loading: false,
  isDeliveryDrawerShow: false,
  isVerifyDrawerShow: false,
  isRefundDrawerShow: false,
  isDetailDrawerShow: false,
})

// 处理搜索
async function handleSearch() {
  try {
    state.loading = true
    const query = {
      storeId: data.searchForm.storeId ? Number(data.searchForm.storeId) : undefined,
      status: data.searchForm.status ? data.searchForm.status : undefined,
      orderNo: data.searchForm.orderNo ? data.searchForm.orderNo : undefined,
      createdStart: data.searchForm.searchDateRange[0] ? data.searchForm.searchDateRange[0] + ' 00:00:00' : undefined,
      createdEnd: data.searchForm.searchDateRange[1] ? data.searchForm.searchDateRange[1] + ' 23:59:59' : undefined,
      pageNum: data.pagination.currentPage,
      pageSize: data.pagination.pageSize,
    } as OrderListRequest
    const res = await getOrderList(query)
    if (res.code === 0) {
      const { records, total } = res.data as OrderListResponse
      data.orders = records
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
    storeId: '',
    status: '',
    searchDateRange: [],
    orderNo: '',
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

// 订单处理
function handleAudit(row: any) {
  data.orderId = Number(row.id)
  if (row.status === 'PENDING_DELIVERED') {
    // 待发货
    state.isDeliveryDrawerShow = true
  } else if (row.status === 'PENDING_DELIVERY') {
    // 待核销
    state.isVerifyDrawerShow = true
  } else if (row.status === 'REFUNDING') {
    // 退款中
    state.isRefundDrawerShow = true
  } else {
    ElMessage({
      message: '订单无需处理',
      type: 'info',
    })
  }
}

// 新增订单
function handleAdd() {
  createOrder({
    storeId: 1,
    payMethod: '1',
    items: [
      {
        productSkuId: 2,
        quantity: 2,
      },
      {
        productSkuId: 3,
        quantity: 2,
      },
      {
        productSkuId: 4,
        quantity: 2,
      },
    ],
    idempotencyKey: generateSecureRandomString(16),
  })
}

// 订单详情
function handleDetail(row: any) {
  data.orderId = Number(row.id)
  state.isDetailDrawerShow = true
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
