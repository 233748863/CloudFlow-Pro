<template>
  <div class="flex flex-col gap4 p4 h-[calc(100vh-85px)]">
    <el-card v-show="state.showSearch">
      <el-form :inline="true" :model="state.searchForm" size="small">
        <el-form-item label="行业名称" prop="name">
          <el-input
            v-model="state.searchForm.name"
            placeholder="请输入行业名称搜索"
            style="width: 200px; margin-right: 10px"
            @keyup.enter.native="handleSearch"
          />
        </el-form-item>
        <!--        <el-form-item label="创建时间" prop="createTime">-->
        <!--          <el-date-picker-->
        <!--            v-model="state.searchForm.createTime"-->
        <!--            end-placeholder="结束日期"-->
        <!--            range-separator="至"-->
        <!--            start-placeholder="开始日期"-->
        <!--            style="width: 200px; margin-right: 10px"-->
        <!--            type="daterange"-->
        <!--            value-format="yyyy-MM-dd"-->
        <!--          />-->
        <!--        </el-form-item>-->
        <el-form-item>
          <el-button icon="Search" type="primary" @click="handleSearch">查询</el-button>
          <el-button icon="Refresh" @click="handleReset">重置</el-button>
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
        <div class="flex flex-row items-center justify-between">
          <el-button type="primary" @click="showAddDialog">
            <el-icon>
              <Plus />
            </el-icon>
            添加行业
          </el-button>
          <right-toolbar
            v-model:show-search="state.showSearch"
            class="flex flex-row justify-end"
            @queryTable="handleSearch"
          />
        </div>
      </template>
      <el-table v-loading="state.loading" :data="industryList" style="width: 100%" border stripe>
        <el-table-column align="center" label="行业ID" prop="id" width="80" />
        <el-table-column align="center" label="排名权重" prop="weight" />
        <el-table-column align="center" label="行业名称" prop="name" />
        <el-table-column align="center" label="行业描述" prop="description" />
        <el-table-column align="center" label="是否启用" prop="enable">
          <template #default="scope">
            <el-tag :type="scope.row.enable ? 'success' : 'danger'">{{ scope.row.enable ? '是' : '否' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column align="center" fixed="right" label="操作" width="150">
          <template #default="scope">
            <el-button size="small" type="primary" text @click="showEditDialog(scope.row)">编辑</el-button>
            <el-button size="small" type="danger" text @click="handleDelete(scope.row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
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

    <!-- 添加行业弹窗 -->
    <el-dialog v-model="addDialogVisible" :before-close="handleDialogClose" title="添加行业" width="400px">
      <el-form ref="addFormRef" :model="addForm" :rules="addFormRules" label-width="80px">
        <el-form-item label="行业名称" prop="name">
          <el-input v-model="addForm.name" placeholder="请输入行业名称" />
        </el-form-item>
        <el-form-item label="权重" prop="weight">
          <el-input v-model="addForm.weight" placeholder="请输入权重" type="number" />
        </el-form-item>
        <el-form-item label="行业描述" prop="description">
          <el-input v-model="addForm.description" :rows="2" placeholder="请输入行业描述" type="textarea" />
        </el-form-item>
        <el-form-item label="是否启用" prop="enable">
          <el-radio-group v-model="addForm.enable">
            <el-radio :label="true">是</el-radio>
            <el-radio :label="false">否</el-radio>
          </el-radio-group>
        </el-form-item>
      </el-form>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="handleDialogClose">取消</el-button>
          <el-button type="primary" @click="handleAdd">确定</el-button>
        </span>
      </template>
    </el-dialog>

    <!-- 编辑行业弹窗 -->
    <el-dialog v-model="editDialogVisible" :before-close="handleDialogClose" title="编辑行业" width="400px">
      <el-form ref="editFormRef" :model="editForm" :rules="editFormRules" label-width="80px">
        <el-form-item label="行业ID" prop="id">
          <el-input v-model="editForm.id" disabled />
        </el-form-item>
        <el-form-item label="行业名称" prop="name">
          <el-input v-model="editForm.name" placeholder="请输入行业名称" />
        </el-form-item>
        <el-form-item label="权重" prop="weight">
          <el-input v-model="editForm.weight" placeholder="请输入权重" type="number" />
        </el-form-item>
        <el-form-item label="行业描述" prop="description">
          <el-input v-model="editForm.description" :rows="2" placeholder="请输入行业描述" type="textarea" />
        </el-form-item>
        <el-form-item label="是否启用" prop="enable">
          <el-radio-group v-model="editForm.enable">
            <el-radio :label="true">是</el-radio>
            <el-radio :label="false">否</el-radio>
          </el-radio-group>
        </el-form-item>
      </el-form>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="handleDialogClose">取消</el-button>
          <el-button type="primary" @click="handleUpdate">确定</el-button>
        </span>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'
import { addIndustry, deleteIndustry, getIndustryList, updateIndustry } from '/@/api/merchantsAlliance/platformIndustry'
import {
  PlatformIndustry,
  PlatformIndustryCreateRequest,
  PlatformIndustryEditRequest,
} from '/@/api/merchantsAlliance/store/types'

// 表格数据
const industryList = ref<PlatformIndustry[]>([])

// 添加弹窗相关
const addDialogVisible = ref(false)
const addFormRef = ref()
// 添加行业表单数据
const addForm = reactive<PlatformIndustryCreateRequest>({
  name: '',
  weight: 0,
  description: '',
  enable: true,
})
const state = reactive({
  showSearch: true,
  searchForm: {
    name: '',
    createTime: [],
    pageNum: 1,
    pageSize: 10,
  },
  loading: false,
  pagination: {
    currentPage: 1,
    pageSize: 10,
    total: 0,
  },
})
const addFormRules = reactive({
  name: [
    { required: true, message: '请输入行业名称', trigger: 'blur' },
    { min: 1, max: 50, message: '行业名称长度应在 1 到 50 个字符之间', trigger: 'blur' },
  ],
})
// 分页
const handleCurrentChange = (val: number) => {
  state.pagination.currentPage = val
  handleSearch()
}
const handleSizeChange = (val: number) => {
  state.pagination.pageSize = val
  handleSearch()
}
// 编辑弹窗相关
const editDialogVisible = ref(false)
const editFormRef = ref()
// 编辑行业表单数据
const editForm = reactive<PlatformIndustryEditRequest>({
  id: 0,
  name: '',
  weight: 0,
  description: '',
  enable: true,
})
const editFormRules = reactive({
  name: [
    { required: true, message: '请输入行业名称', trigger: 'blur' },
    { min: 1, max: 50, message: '行业名称长度应在 1 到 50 个字符之间', trigger: 'blur' },
  ],
})

// 搜索
async function handleSearch() {
  state.loading = true
  try {
    // 合并分页参数
    state.searchForm.pageNum = state.pagination.currentPage
    state.searchForm.pageSize = state.pagination.pageSize
    const query = {
      name: state.searchForm.name || '',
      // createdTimeStart: state.searchForm.createTime[0] || '',
      // createdTimeEnd: state.searchForm.createTime[1] || '',
      pageNum: state.searchForm.pageNum || 1,
      pageSize: state.searchForm.pageSize || 10,
    }
    const response = await getIndustryList(query)
    industryList.value = response.data.records || []
    state.pagination.total = response.data.total || 0
  } catch (error) {
    ElMessage.error('搜索行业列表失败')
  } finally {
    state.loading = false
  }
}

async function handleReset() {
  state.searchForm.name = ''
  await handleSearch()
}

// 显示添加弹窗
const showAddDialog = () => {
  Object.assign(addForm, { name: '', weight: 0, description: '', enable: true })
  addDialogVisible.value = true
}

// 显示编辑弹窗
const showEditDialog = (row: PlatformIndustry) => {
  Object.assign(editForm, row)
  editDialogVisible.value = true
}

// 关闭弹窗
const handleDialogClose = () => {
  addDialogVisible.value = false
  editDialogVisible.value = false

  // 重置表单
  if (addFormRef.value) {
    addFormRef.value.resetFields()
  }
  if (editFormRef.value) {
    editFormRef.value.resetFields()
  }
}

// 添加行业
const handleAdd = async () => {
  if (!addFormRef.value) return
  try {
    await addFormRef.value.validate()
    await addIndustry(addForm)
    ElMessage.success('添加成功')
    handleDialogClose()
    await handleSearch()
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'message' in error) {
      ElMessage.error((error as any).message || '添加失败')
    } else {
      ElMessage.error('添加失败')
    }
  }
}

// 更新行业
const handleUpdate = async () => {
  if (!editFormRef.value) return
  try {
    await editFormRef.value.validate()
    await updateIndustry(editForm)
    ElMessage.success('更新成功')
    handleDialogClose()
    await handleSearch()
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'message' in error) {
      ElMessage.error((error as any).message || '更新失败')
    } else {
      ElMessage.error('更新失败')
    }
  }
}

// 删除行业
const handleDelete = async (row: PlatformIndustry) => {
  try {
    await ElMessageBox.confirm(`确定要删除行业「${row.name}」吗？`, '确认删除', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning',
    })
    await deleteIndustry(row.id)
    ElMessage.success('删除成功')
    await handleSearch()
  } catch (error) {
    if (error !== 'cancel') {
      ElMessage.error('删除失败')
    }
  }
}

// 组件挂载时加载数据
onMounted(() => {
  handleReset()
})
</script>

<style scoped lang="scss">
.layout-padding {
  padding: 20px;
}

.layout-padding-auto {
  max-width: 1400px;
  margin: 0 auto;
}

:deep(.el-table) {
  margin-top: 10px;
}

:deep(.el-dialog__body) {
  padding: 20px;
}

:deep(.el-form-item) {
  margin-bottom: 20px;
}
</style>
