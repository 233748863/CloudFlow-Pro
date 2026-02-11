<template>
  <div class="flex flex-col gap4 p4 h-[calc(100vh-85px)]">
    <!-- 搜索表单 -->
    <el-card v-if="showSearch">
      <el-form ref="queryRef" :inline="true" :model="state.searchForm" size="small" @keyup.enter="search">
        <el-form-item label="名称" prop="name">
          <el-input v-model="state.searchForm.name" placeholder="请输入商家名称" />
        </el-form-item>
        <el-form-item label="经营状态" prop="businessStatus">
          <el-select v-model="state.searchForm.businessStatus" placeholder="请选择经营状态" multiple>
            <el-option
              v-for="(item, index) in merchant_audit_type"
              :key="index"
              :label="item.label"
              :value="item.value"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="商家状态" prop="enable">
          <el-select v-model="state.searchForm.enable" placeholder="请选择商家状态">
            <el-option :value="true" label="正常" />
            <el-option :value="false" label="禁用" />
          </el-select>
        </el-form-item>
        <el-form-item label="排序" prop="orderByCreateTime">
          <el-select v-model="state.searchForm.orderByCreateTime" placeholder="请选择排序">
            <el-option :value="true" label="按创建时间升序" />
            <el-option :value="false" label="按创建时间降序" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button icon="Search" type="primary" @click="search">查询</el-button>
          <el-button icon="Refresh" @click="resetForm">重置</el-button>
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
        <right-toolbar v-model:show-search="showSearch" class="flex flex-row justify-end" @queryTable="search" />
      </template>

      <!-- 表格 -->
      <el-table
        v-loading="state.loading"
        :cell-style="() => ({ textAlign: 'center' })"
        :data="state.merchantList"
        :header-cell-style="() => ({ textAlign: 'center' })"
        class="h-full"
        style="width: 100%"
        border
      >
        <el-table-column label="id" prop="id" width="100" show-overflow-tooltip />
        <el-table-column label="商家名称" prop="merchantName" width="150" show-overflow-tooltip />
        <el-table-column label="logo" prop="logoUrl" width="80" show-overflow-tooltip>
          <template #default="scope">
            <el-image
              :preview-src-list="[getImageUrl(scope.row.logoUrl)]"
              :preview-teleported="true"
              :src="getImageUrl(scope.row.logoUrl)"
              fit="fill"
              style="width: 50px; height: 50px"
            />
          </template>
        </el-table-column>
        <el-table-column label="行业" prop="industryName" width="150" show-overflow-tooltip />
        <el-table-column label="联系人" prop="contactName" width="100" show-overflow-tooltip />
        <el-table-column label="联系电话" prop="contactPhone" width="120" show-overflow-tooltip />
        <el-table-column label="地址" min-width="200" prop="addressDetail" show-overflow-tooltip />
        <el-table-column label="代理商id" prop="agentId" width="100" show-overflow-tooltip />
        <el-table-column label="代理商名称" prop="agentName" width="150" show-overflow-tooltip />
        <el-table-column label="经营状态" prop="businessStatus" width="100" show-overflow-tooltip>
          <template #default="scope">
            <el-tag :type="businessStatusTypes.textColor[scope.row.businessStatus]">
              {{ businessStatusTypes.textMap[scope.row.businessStatus] }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="是否启用" prop="enable" width="100" show-overflow-tooltip>
          <template #default="scope">
            <el-tag :type="!scope.row.enable ? 'success' : 'danger'">{{ !scope.row.enable ? '正常' : '禁用' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="创建时间" prop="createdTime" width="200" show-overflow-tooltip />
        <el-table-column fixed="right" label="操作" width="150">
          <template #default="scope">
            <el-button size="small" type="primary" link @click="handleDetail(scope.row)">查看详情</el-button>
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
    <merchant-detail-drawer
      v-model:is-show="state.showDetailDrawer"
      :merchant-id="state.merchantId"
      @error="state.showDetailDrawer = false"
    />
  </div>
</template>

<script setup lang="ts">
import { getMerchantList } from '/@/api/merchantsAlliance/merchant/merchant'
import { MerchantListRecords, MerchantListRequest, MerchantListResponse } from '/@/api/merchantsAlliance/merchant/types'
import { useDict } from '/@/hooks/dict'
import { ElMessage } from 'element-plus'
import MerchantDetailDrawer from '/@/views/merchantsAlliance/merchants/merchantDetailDrawer.vue'
import { getImageUrl } from '/@/views/merchantsAlliance/way'

const { merchant_audit_type } = useDict('merchant_audit_type')

// 商家经营状态映射
const businessStatusTypes = computed(() => {
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
// 是否显示搜索框
const showSearch = ref(true)

const state = reactive({
  searchForm: {} as MerchantListRequest, // 查询参数
  merchantList: [] as MerchantListRecords[], // 商家列表
  loading: false, // 是否加载中
  merchantId: null as string | null, // 商家ID
  showDetailDrawer: false, // 是否显示详情抽屉
  pagination: {
    // 分页信息
    currentPage: 1,
    pageSize: 10,
    total: 0,
  },
})

// 重置查询表单
const resetForm = () => {
  state.searchForm = {} as MerchantListRequest
}

// 查询商家列表
const search = async () => {
  state.loading = true
  try {
    const query = {
      ...state.searchForm,
      pageNum: state.pagination.currentPage,
      pageSize: state.pagination.pageSize,
    } as MerchantListRequest
    const res = await getMerchantList(query)
    const data = res.data as MerchantListResponse
    state.merchantList = data.records as MerchantListRecords[]
    state.pagination = {
      currentPage: data.current || 1,
      pageSize: data.size || 10,
      total: data.total || 0,
    }
  } catch (error) {
    ElMessage.error('获取商家列表失败')
  } finally {
    state.loading = false
  }
}
// 分页大小改变处理
const handleSizeChange = (pageSize: number) => {
  state.pagination.pageSize = pageSize
  search()
}
// 分页当前页改变处理
const handleCurrentChange = (page: number) => {
  state.pagination.currentPage = page
  search()
}
// 查看详情
const handleDetail = (row: any) => {
  state.merchantId = row.id
  state.showDetailDrawer = true
}

onMounted(() => {
  search()
})
</script>

<style scoped lang="scss">
:deep(.el-card__header) {
  padding: 5px 20px !important;
}
</style>
