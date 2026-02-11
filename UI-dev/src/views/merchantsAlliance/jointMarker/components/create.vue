<template>
  <el-dialog v-model="state.showDialog" :title="state.dialogTitle" width="600px">
    <el-form ref="createPlanFormRef" :model="state.planForm" :rules="createPlanFormRules" label-width="100px">
      <el-form-item label="计划名称" prop="name">
        <el-input v-model="state.planForm.name" placeholder="请输入计划名称" style="width: 100%" />
      </el-form-item>
      <el-form-item label="计划描述" prop="description">
        <el-input v-model="state.planForm.description" :rows="3" placeholder="请输入计划描述" type="textarea" />
      </el-form-item>
      <el-form-item label="开始时间" prop="startTime">
        <el-date-picker
          v-model="state.planForm.startTime"
          placeholder="请选择开始时间"
          style="width: 100%"
          type="datetime"
          value-format="YYYY-MM-DD HH:mm:ss"
        />
      </el-form-item>
      <el-form-item label="结束时间" prop="endTime">
        <el-date-picker
          v-model="state.planForm.endTime"
          placeholder="请选择结束时间"
          style="width: 100%"
          type="datetime"
          value-format="YYYY-MM-DD HH:mm:ss"
        />
      </el-form-item>
    </el-form>
    <template #footer>
      <span class="dialog-footer">
        <el-button @click="state.showDialog = false">取消</el-button>
        <el-button type="primary" @click="savePlan">{{ state.saveButtonText }}</el-button>
      </span>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { JointMarketingPlanCreateRequest, JointMarketingPlanUpdateRequest } from '/@/api/merchantsAlliance/jointMarket/types'
import { createPlan, updatePlan } from '/@/api/merchantsAlliance/jointMarket'
import { ElMessage } from 'element-plus'
import { reactive, ref, watch } from 'vue'

const props = defineProps({
  isShow: {
    type: Boolean,
    default: false,
  },
  planData: {
    type: Object,
    default: null,
  },
})

const emits = defineEmits(['update:isShow', 'success'])

// 表单状态管理
const state = reactive({
  showDialog: false,
  dialogTitle: '创建联合营销计划',
  saveButtonText: '确定',
  isEdit: false,
  planForm: {
    id: '',
    name: '',
    description: '',
    startTime: '',
    endTime: '',
  },
})

const createPlanFormRef = ref<any>(null)

// 表单验证规则
const createPlanFormRules = {
  name: [
    { required: true, message: '请输入计划名称', trigger: 'blur' },
    { max: 50, message: '计划名称不能超过50个字符', trigger: 'blur' },
  ],
  description: [
    { required: true, message: '请输入计划描述', trigger: 'blur' },
    { max: 200, message: '计划描述不能超过200个字符', trigger: 'blur' },
  ],
  startTime: [{ required: true, message: '请选择开始时间', trigger: 'change' }],
  endTime: [{ required: true, message: '请选择结束时间', trigger: 'change' }],
}

// 保存计划
const savePlan = async () => {
  try {
    await createPlanFormRef.value.validate()

    // 验证开始时间和结束时间的逻辑
    if (state.planForm.startTime >= state.planForm.endTime) {
      ElMessage.error('开始时间不能晚于或等于结束时间')
      return
    }

    if (state.isEdit) {
      // 更新计划
      const query = {
        id: state.planForm.id,
        name: state.planForm.name,
        description: state.planForm.description,
        startTime: state.planForm.startTime,
        endTime: state.planForm.endTime,
      } as JointMarketingPlanUpdateRequest

      const res = await updatePlan(query)
      if (res.code === 0) {
        ElMessage.success('更新成功')
        state.showDialog = false
        emits('success', state.planForm)
        // 重置表单
        resetForm()
      }
    } else {
      // 创建计划
      const query = {
        name: state.planForm.name,
        description: state.planForm.description,
        startTime: state.planForm.startTime,
        endTime: state.planForm.endTime,
      } as JointMarketingPlanCreateRequest

      const res = await createPlan(query)
      if (res.code === 0) {
        ElMessage.success('创建成功')
        state.showDialog = false
        emits('success', state.planForm)
        // 重置表单
        resetForm()
      }
    }
  } catch (e) {
    ElMessage.error(state.isEdit ? '更新失败' : '创建失败')
  }
}

// 重置表单
const resetForm = () => {
  if (createPlanFormRef.value) {
    createPlanFormRef.value.resetFields()
  }
  state.planForm = {
    id: '',
    name: '',
    description: '',
    startTime: '',
    endTime: '',
  }
  state.isEdit = false
  state.dialogTitle = '创建联合营销计划'
  state.saveButtonText = '确定'
}

// 监听 isShow 变化，同步更新弹窗显示状态
watch(
  () => props.isShow,
  (newVal) => {
    if (newVal) {
      state.showDialog = true
    }
  }
)

// 监听弹窗关闭状态
watch(
  () => state.showDialog,
  (newVal) => {
    if (!newVal) {
      emits('update:isShow', false)
      // 弹窗关闭时重置表单
      resetForm()
    }
  }
)

// 监听planData变化，处理编辑数据
watch(
  () => props.planData,
  (newVal) => {
    if (newVal) {
      state.isEdit = true
      state.dialogTitle = '修改联合营销计划'
      state.saveButtonText = '保存修改'
      state.planForm = {
        id: newVal.id || '',
        name: newVal.name || '',
        description: newVal.description || '',
        startTime: newVal.startTime || '',
        endTime: newVal.endTime || '',
      }
    }
  },
  { deep: true }
)
</script>

<style scoped lang="scss">
.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}
</style>
