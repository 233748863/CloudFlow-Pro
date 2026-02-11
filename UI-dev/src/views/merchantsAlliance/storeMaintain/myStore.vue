<template>
  <div class="flex flex-col gap4 p4 h-[calc(100vh-85px)]">
    <!-- 搜索筛选区域 -->
    <el-card v-if="showSearch">
      <el-form :inline="true" :model="state.searchForm" size="small">
        <el-form-item label="门店名称">
          <el-input v-model="state.searchForm.keyword" placeholder="请输入门店名称" style="width: 200px" />
        </el-form-item>
        <el-form-item label="门店状态">
          <el-select
            v-model="state.searchForm.businessStatus"
            placeholder="请选择门店状态"
            style="width: 150px"
            multiple
          >
            <el-option v-for="(item, index) in shop_audit_type" :key="index" :label="item.label" :value="item.value" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button icon="Search" type="primary" @click="handleSearch">搜索</el-button>
          <el-button icon="Refresh" @click="handleReset">重置</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <!-- 门店列表 -->
    <el-card
      body-class="flex-1 flex flex-col overflow-auto"
      class="flex-1 flex flex-col"
      footer-class="py-0 mb-2"
      header-class="el-card__header"
    >
      <!-- 工具栏 -->
      <template #header>
        <div class="flex flex-row justify-between items-center">
          <el-button size="small" type="primary" @click="handleCreate">新建门店</el-button>
          <right-toolbar
            v-model:show-search="showSearch"
            class="flex flex-row justify-end"
            @queryTable="loadStoreList"
          />
        </div>
      </template>

      <!-- 门店列表 -->
      <el-table
        v-loading="loading"
        :cell-style="() => ({ textAlign: 'center' })"
        :data="state.storeList"
        :header-cell-style="() => ({ textAlign: 'center' })"
        class="h-full"
        style="width: 100%"
        border
      >
        <el-table-column label="门店ID" prop="id" width="80" />
        <el-table-column label="Logo" prop="logoUrl" width="80">
          <template #default="scope">
            <el-image
              :preview-src-list="[getImageUrl(scope.row.logoUrl)]"
              :preview-teleported="true"
              :src="getImageUrl(scope.row.logoUrl)"
              fit="cover"
              style="width: 40px; height: 40px"
            />
          </template>
        </el-table-column>
        <el-table-column label="门店名称" prop="name" />
        <el-table-column label="联系电话" prop="phone" />
        <el-table-column label="门店地址" prop="addressDetail" />
        <el-table-column label="营业时间" prop="businessHours" width="120" />
        <el-table-column label="门店状态" prop="businessStatus" width="100">
          <template #default="scope">
            <el-tag :type="businessStatusTypes.textColor[scope.row.businessStatus]">
              {{ businessStatusTypes.textMap[scope.row.businessStatus] }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="是否被禁用" prop="enable" width="100">
          <template #default="scope">
            <el-tag :type="scope.row.enable ? 'success' : 'danger'">{{ scope.row.enable ? '否' : '是' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column fixed="right" label="操作" width="350">
          <template #default="scope">
            <el-button size="small" type="primary" text @click="handleEdit(scope.row.id)">编辑门店信息</el-button>
            <el-button size="small" type="primary" text @click="handleBizStatus(scope.row)">编辑营业状态</el-button>
            <el-button size="small" type="success" text @click="handleViewAudit(scope.row.id)">查看审核记录</el-button>
            <el-button size="small" type="danger" text @click="handleDelete(scope.row.id)">删除</el-button>
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

    <!-- 创建门店抽屉 -->
    <create-drawer v-model:is-show="state.isCreating" @success="getStoreList" />
    <!-- 编辑门店抽屉 -->
    <edit-drawer v-model:is-show="state.isEditing" :store-id="state.storeId" />
    <!-- 编辑门店营业状态弹窗 -->
    <biz-status-dialog v-model:is-show="state.isBizStatus" :data="state.bizStatusData" />
    <!-- 审核记录抽屉 -->
    <audit-history-drawer v-model:is-show="state.isViewAudit" :store-id="state.storeId" />
    <!-- 删除门店 -->
    <el-dialog v-model="state.isDelete" title="删除门店" width="500px">
      <el-form
        ref="deleteStoreFormRef"
        :disabled="!isDelete"
        :model="state.deleteStoreForm"
        :rules="formRules.deleteStoreFormRules"
      >
        <el-form-item label="删除原因" prop="reason">
          <el-input v-model="state.deleteStoreForm.reason" :rows="6" placeholder="请输入删除原因" type="textarea" />
        </el-form-item>
      </el-form>
      <template #footer>
        <span class="dialog-footer">
          <el-button type="danger" @click="handleDeleteStore">删除</el-button>
          <el-button @click="state.isDelete = false">取消</el-button>
        </span>
      </template>
    </el-dialog>
  </div>
</template>

<script lang="ts" setup>
import { reactive, ref } from 'vue'
import { deleteStore, getStoreList } from '/@/api/merchantsAlliance/store/store'
import {
  DeleteStoreRequest,
  Store,
  StoreListRequest,
  StoreListResponse,
  UpdateStatusBizRequest,
} from '/@/api/merchantsAlliance/store/types'
import { ElMessage } from 'element-plus'
import { useDict } from '/@/hooks/dict'
import CreateDrawer from '/@/views/merchantsAlliance/storeMaintain/createDrawer.vue'
import EditDrawer from '/@/views/merchantsAlliance/storeMaintain/editDrawer.vue'
import BizStatusDialog from '/@/views/merchantsAlliance/storeMaintain/bizStatusDialog.vue'
import AuditHistoryDrawer from '/@/views/merchantsAlliance/storeMaintain/auditHistoryDrawer.vue'
import { getImageUrl } from '/@/views/merchantsAlliance/way'

const { shop_audit_type } = useDict('shop_audit_type')

// 删除门店表单引用
const deleteStoreFormRef = ref<any>(null)

// 状态管理
const loading = ref<boolean>(false) // 是否正在加载门店信息
const isDelete = ref<boolean>(false)

// 是否显示搜索筛选区域
const showSearch = ref<boolean>(true)
// 经营状态映射
const businessStatusTypes = computed(() => {
  const textMap = shop_audit_type.value.reduce((prev: any, cur: any) => ({ ...prev, [cur.value]: cur.label }), {})
  const textColor = shop_audit_type.value.reduce(
    (prev: any, cur: any) => ({
      ...prev,
      [cur.value]: cur.remarks,
    }),
    {}
  )
  return { textMap: textMap, textColor: textColor }
})

const state = reactive({
  // 搜索表单数据
  searchForm: {
    keyword: '',
    businessStatus: [],
  },
  // 分页信息
  pagination: {
    currentPage: 1,
    pageSize: 10,
    total: 0,
  },
  // 门店列表数据
  storeList: [] as Store[],
  storeId: '',
  isCreating: false,
  isEditing: false,
  isBizStatus: false,
  isViewAudit: false,
  bizStatusData: {} as UpdateStatusBizRequest,
  isDelete: false,
  // 删除门店表单数据
  deleteStoreForm: {} as DeleteStoreRequest,
})

// 表单验证规则
const formRules = {
  deleteStoreFormRules: {
    // 删除门店表单验证规则
    reason: [{ required: true, message: '请输入删除原因', trigger: 'blur' }],
  },
}

// 加载门店列表
const loadStoreList = async () => {
  loading.value = true
  try {
    const params: StoreListRequest = {
      page: state.pagination.currentPage,
      pageSize: state.pagination.pageSize,
      businessStatus: state.searchForm.businessStatus,
      keyword: state.searchForm.keyword,
    }
    const response = await getStoreList(params)
    const data = response.data as StoreListResponse
    state.storeList = data?.records || []
    state.pagination.total = data?.total || 0
    state.pagination.pageSize = data?.pageSize || state.pagination.pageSize
    state.pagination.currentPage = data?.page || state.pagination.currentPage
  } catch (err) {
    ElMessage.error('获取门店列表失败')
  } finally {
    loading.value = false
  }
}

// 搜索
const handleSearch = () => {
  state.pagination.currentPage = 1
  loadStoreList()
}

// 重置搜索
const handleReset = () => {
  state.searchForm.keyword = ''
  state.searchForm.businessStatus = []
  state.pagination.currentPage = 1
  loadStoreList()
}

// 分页处理
const handleSizeChange = (size: number) => {
  state.pagination.pageSize = size
  loadStoreList()
}

// 分页当前页改变处理
const handleCurrentChange = (current: number) => {
  state.pagination.currentPage = current
  loadStoreList()
}

// 创建门店
const handleCreate = () => {
  state.isCreating = true
}

// 编辑门店
const handleEdit = (id: string) => {
  state.storeId = id
  state.isEditing = true
}

// 编辑门店状态
const handleBizStatus = (row: any) => {
  state.bizStatusData = {
    storeId: row.id,
    businessStatus: row.businessStatus,
    businessHours: row.businessHours,
    modifyReason: '',
  }
  state.isBizStatus = true
}

// 查看审核记录
const handleViewAudit = (id: string) => {
  state.storeId = id
  state.isViewAudit = true
}

// 删除门店
const handleDelete = (id: string) => {
  state.deleteStoreForm.storeId = id
  state.deleteStoreForm.reason = ''
  state.isDelete = true
}

const handleDeleteStore = async () => {
  try {
    await deleteStoreFormRef.value.validate()
    await deleteStore(state.deleteStoreForm)
    ElMessage.success('删除门店成功')
    state.isDelete = false
    await loadStoreList()
  } catch (err) {
    ElMessage.error('删除门店失败')
  }
}

onMounted(() => {
  loadStoreList()
})
</script>

<style lang="scss" scoped>
:deep(.el-card__header) {
  padding: 5px 20px !important;
}
</style>
