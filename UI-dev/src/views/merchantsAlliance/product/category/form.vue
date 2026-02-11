<template>
  <el-dialog v-model="show" :title="isEdit ? '编辑分类' : '新增分类'" destroy-on-close draggable>
    <el-form
      ref="formRef"
      :model="formData"
      :rules="rules"
      class="flex flex-col gap4"
      label-position="top"
      label-width="100px"
    >
      <el-row :gutter="20">
        <el-col :span="12">
          <el-form-item label="分类名称" prop="name">
            <el-input v-model="formData.name" placeholder="请输入分类名称" />
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="上级分类" prop="parentCategory">
            <el-tree-select
              v-model="formData.parentId"
              :check-on-click-node="true"
              :check-strictly="true"
              :data="parentOpts"
              :props="{ label: 'name', value: 'id' }"
              :render-after-expand="false"
              node-key="id"
              style="width: 240px"
            />
          </el-form-item>
        </el-col>
      </el-row>

      <el-row :gutter="20">
        <el-col :span="12">
          <el-form-item class="w60" label="排序" prop="sort">
            <el-input-number v-model="formData.sortOrder" :min="0" placeholder="数字越小越靠前" />
          </el-form-item>
        </el-col>
      </el-row>

      <!-- 按钮组 -->
      <el-form-item class="mt8 py b-t-1 b-t-solid b-t-#e5e7eb">
        <div class="flex justify-end gap3 w100">
          <el-button @click="show = false">取 消</el-button>
          <el-button type="primary" @click="handleSubmit">保 存</el-button>
        </div>
      </el-form-item>
    </el-form>
  </el-dialog>
</template>

<script setup lang="ts">
import { saveApi, categoryTreeApi } from '/@/api/merchantsAlliance/product/category/api'
import { ICategory, ICategoryForm } from '/@/api/merchantsAlliance/product/category/types'
import type { FormInstance, FormRules } from 'element-plus'
import { ElMessage } from 'element-plus'
import { reactive, ref } from 'vue'

const emit = defineEmits(['refresh'])

const show = ref(false)
const isEdit = ref(false)
const formRef = ref<FormInstance>()

const parentOpts = ref<ICategory[]>([])
const formData = reactive<ICategoryForm>({
  name: '',
  parentId: '',
  sortOrder: null,
})

const rules: FormRules<ICategory> = {
  name: [{ required: true, message: '请输入分类名称', trigger: 'blur' }],
  code: [{ required: true, message: '请输入分类编码', trigger: 'blur' }],
  status: [{ required: true, message: '请选择状态', trigger: 'change' }],
}

const handleSubmit = async () => {
  if (!formRef.value) return
  await formRef.value.validate(async (valid) => {
    if (valid) {
      const resp = await saveApi(formData, isEdit.value)
      if (resp.code === 0) {
        ElMessage.success('分类添加成功')
        emit('refresh')
        show.value = false
      } else {
        ElMessage.error(resp.msg || '分类添加失败，请稍后再试')
      }
    }
  })
}

const loadOpts = async () => {
  const resp = await categoryTreeApi()
  if (resp.code === 0) {
    parentOpts.value = resp.data
  }
}

const openDialog = (category?: ICategory, isUpdate: boolean = false) => {
  Object.assign(formData, category)
  isEdit.value = isUpdate
  loadOpts()
  show.value = true
}

defineExpose({ openDialog })
</script>
