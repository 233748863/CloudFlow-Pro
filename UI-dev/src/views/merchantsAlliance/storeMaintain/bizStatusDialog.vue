<template>
  <el-dialog v-model="state.showDialog" title="编辑门店营业状态" width="500px">
    <el-form
      ref="updateStoreBizStatusFormRef"
      :model="state.bizStatusForm"
      :rules="updateStoreBizStatusFormRules"
      label-width="80px"
    >
      <el-form-item label="门店状态" prop="businessStatus">
        <el-radio-group v-model="state.bizStatusForm.businessStatus">
          <el-radio v-for="(value, key) in STORE_BUSINESS_STATUS" :key="key" :label="value" :value="key"/>
        </el-radio-group>
      </el-form-item>
      <el-form-item label="营业时间" prop="businessHours">
        <el-time-picker
          v-model="state.bizStatusForm.businessHours"
          end-placeholder="休业时间"
          format="HH:mm"
          label="营业时间"
          range-separator="-"
          start-placeholder="开业时间"
          value-format="HH:mm"
          is-range
        />
      </el-form-item>
      <el-form-item label="修改原因" prop="modifyReason">
        <el-input v-model="state.bizStatusForm.modifyReason" :rows="2" placeholder="请输入修改原因" type="textarea" />
      </el-form-item>
    </el-form>
    <template #footer>
      <span class="dialog-footer">
        <el-button @click="state.showDialog = false">取消</el-button>
        <el-button type="primary" @click="saveBizStatus">确定</el-button>
      </span>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { STORE_BUSINESS_STATUS, UpdateStatusBizRequest } from '/@/api/merchantsAlliance/store/types'
import { useDict } from '/@/hooks/dict'
import { ElMessage } from 'element-plus'
import { updateStoreBizStatus } from '/@/api/merchantsAlliance/store/store'

const { shop_audit_type } = useDict('shop_audit_type')
const props = defineProps({
  isShow: {
    type: Boolean,
    default: false,
  },
  data: {
    type: Object as () => UpdateStatusBizRequest,
    default: () => ({} as UpdateStatusBizRequest),
  },
})

const emits = defineEmits(['update:isShow', 'success'])

// 抽屉状态管理
const state = reactive({
  showDialog: false,
  bizStatusForm: {
    storeId: '',
    businessStatus: '',
    businessHours: [] as string[],
    modifyReason: '',
  },
})

const updateStoreBizStatusFormRef = ref<any>(null)

const updateStoreBizStatusFormRules = {
  businessStatus: [{ required: true, message: '请选择门店状态', trigger: 'change' }],
  businessHours: [{ required: true, message: '请选择营业时间', trigger: 'change' }],
  modifyReason: [{ required: true, message: '请输入修改原因', trigger: 'blur' }],
}

// 保存门店营业状态
const saveBizStatus = async () => {
  try {
    await updateStoreBizStatusFormRef.value.validate()
    const query = {
      storeId: state.bizStatusForm.storeId,
      businessStatus: state.bizStatusForm.businessStatus || '',
      businessHours: state.bizStatusForm.businessHours?.join('-') || '',
      modifyReason: state.bizStatusForm.modifyReason || '',
    } as UpdateStatusBizRequest
    const res = await updateStoreBizStatus(query)
    if (res.code === 0) {
      ElMessage.success('保存成功')
      state.showDialog = false
      emits('success', state.bizStatusForm)
    }
  } catch (e) {
    ElMessage.error('保存失败')
  }
}

// 监听 isShow 变化，同步更新抽屉显示状态
watch(
  () => props.isShow,
  (newVal) => {
    if (newVal) {
      state.showDialog = true
    }
  }
)
watch(
  () => state.showDialog,
  (newVal) => {
    if (!newVal) {
      emits('update:isShow', false)
    }
  }
)

// 监听 props.data 变化，更新表单数据
watch(
  () => props.data,
  (newVal) => {
    if (newVal) {
      state.bizStatusForm = {
        storeId: newVal.storeId,
        businessStatus: newVal.businessStatus || '',
        businessHours: newVal.businessHours ? newVal.businessHours.split('-') : ([] as string[]),
        modifyReason: '',
      }
    }
  }
)
</script>

<style scoped lang="scss"></style>