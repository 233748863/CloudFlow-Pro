<template>
  <div class="bg-#f8f8f8 p4">
    <div class="mx-auto h-full">
      <!-- 头部 -->
      <el-card class="mb" shadow="never">
        <div class="flex justify-between">
          <div>
            <h1 class="text-2xl font-bold text-#111827">商品分类管理</h1>
            <p class="text-#6b7280 mt1">管理所有商品分类信息</p>
          </div>
          <el-button icon="Plus" type="primary" @click="handleAdd">新增分类</el-button>
        </div>
      </el-card>

      <!-- 表格 -->
      <el-card shadow="never">
        <el-table :data="state.data" :tree-props="{ children: 'children' }" row-key="id" lazy stripe>
          <el-table-column label="分类名称" prop="name" show-overflow-tooltip />
          <el-table-column align="center" label="排序" prop="sortOrder" />
          <el-table-column label="创建时间" prop="createdTime" />
          <el-table-column align="center" fixed="right" label="操作" width="150">
            <template #default="{ row }">
              <el-button icon="Edit" type="success" link @click="handleEdit(row)" />
              <el-button icon="Delete" type="danger" link @click="handleDelete(row)" />
            </template>
          </el-table-column>
        </el-table>
      </el-card>
    </div>

    <form-dialog ref="formDialogRef" @refresh="loadData" />
  </div>
</template>

<script setup lang="ts">
import { ICategory, IFilterParams } from '/@/api/merchantsAlliance/product/category/types'
import { ref } from 'vue'
import { removeApi, categoryTreeApi } from '/@/api/merchantsAlliance/product/category/api'
import { ElMessage } from 'element-plus'

const FormDialog = defineAsyncComponent(() => import('./form.vue'))

const formDialogRef = ref<InstanceType<typeof FormDialog>>()

const state = reactive({
  params: { name: '', parentId: '', page: 1, pageSize: 10, total: 0 } as IFilterParams,
  data: [] as ICategory[],
})

const handleAdd = () => {
  formDialogRef.value?.openDialog()
}

const handleEdit = (row: ICategory) => {
  formDialogRef.value?.openDialog(row, true)
}

const handleDelete = async (row: ICategory) => {
  const resp = await removeApi(row.id)
  if (resp.code === 0) {
    ElMessage.success('删除成功')
    await loadData()
  } else {
    ElMessage.error(resp.msg || '删除失败，请稍后再试')
  }
}

const loadData = async () => {
  const resp = await categoryTreeApi()
  if (resp.code === 0) {
    state.data = resp.data
  }
}

onMounted(() => loadData())
</script>
