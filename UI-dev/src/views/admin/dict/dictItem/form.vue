<template>
  <el-dialog v-model="visible" :title="dataForm.id ? $t('common.editBtn') : $t('common.addBtn')" width="600">
    <el-form ref="dicDialogFormRef" v-loading="loading" :model="dataForm" :rules="dataRules" label-width="90px">
      <el-form-item :label="$t('dictItem.dictType')" prop="dictType">
        <el-input
          v-model="dataForm.dictType"
          :placeholder="$t('dictItem.inputDictTypeTip')"
          clearable
          disabled
        ></el-input>
      </el-form-item>
      <el-form-item :label="$t('dictItem.label')" prop="label">
        <el-input v-model="dataForm.label" :placeholder="$t('dictItem.inputLabelTip')" clearable></el-input>
      </el-form-item>
      <el-form-item :label="$t('dictItem.itemValue')" prop="value">
        <el-input v-model="dataForm.value" :placeholder="$t('dictItem.inputItemValueTip')" clearable></el-input>
      </el-form-item>
      <el-form-item :label="$t('dictItem.description')" prop="description">
        <el-input v-model="dataForm.description" :placeholder="$t('dictItem.inputDescriptionTip')" clearable></el-input>
      </el-form-item>
      <el-form-item :label="$t('dictItem.sortOrder')" prop="sortOrder">
        <el-input-number
          v-model="dataForm.sortOrder"
          :placeholder="$t('dictItem.inputSortOrderTip')"
          clearable
        ></el-input-number>
      </el-form-item>
      <el-form-item :label="$t('dictItem.remarks')" prop="remarks">
        <el-input
          v-model="dataForm.remarks"
          :placeholder="$t('dictItem.inputRemarksTip')"
          :rows="3"
          maxlength="100"
          type="textarea"
        ></el-input>
      </el-form-item>
      <el-form-item label="标签类型" prop="remarks">
        <el-select v-model="dataForm.remarks" placeholder="请选择标签类型">
          <el-option v-for="(item, key) in tagTypes" :key="key" :label="key" :value="key" >
            <span :style="{ color: item }">{{ key }}</span>
          </el-option>
        </el-select>
      </el-form-item>
    </el-form>
    <template #footer>
      <span class="dialog-footer">
        <el-button @click="visible = false">{{ $t('common.cancelButtonText') }}</el-button>
        <el-button :disabled="loading" type="primary" @click="onSubmit">{{ $t('common.confirmButtonText') }}</el-button>
      </span>
    </template>
  </el-dialog>
</template>

<script setup lang="ts" name="dict-item-form">
import { useI18n } from 'vue-i18n'
import { addItemObj, getItemObj, putItemObj, validateDictItemLabel } from '/@/api/admin/dict'
import { useMessage } from '/@/hooks/message'
import { rule } from '/@/utils/validate'

// 定义子组件向父组件传值/事件
const emit = defineEmits(['refresh'])
const { t } = useI18n()

// 定义变量内容
const dicDialogFormRef = ref()

const visible = ref(false)
const loading = ref(false)

const dataForm = reactive({
  id: '',
  dictId: '',
  dictType: '',
  value: '',
  label: '',
  description: '',
  sortOrder: 0,
  remarks: '',
})
const tagTypes = ref({
  'primary': '#409eff',
  'success': '#67c23a',
  'info': '#909399',
  'warning': '#e6a23c',
  'danger': '#f56c6c',
})

const dataRules = reactive({
  dictType: [
    { validator: rule.overLength, trigger: 'blur' },
    {
      required: true,
      message: '请点选左侧字典项',
      trigger: 'blur',
    },
  ],
  value: [
    { validator: rule.overLength, trigger: 'blur' },
    {
      required: true,
      message: '数据值不能为空',
      trigger: 'blur',
    },
  ],
  label: [
    { validator: rule.overLength, trigger: 'blur' },
    { required: true, message: '标签不能为空', trigger: 'blur' },
    {
      validator: (rule: any, value: any, callback: any) => {
        validateDictItemLabel(rule, value, callback, dataForm.dictType, dataForm.id !== '')
      },
      trigger: 'blur',
    },
  ],
  description: [
    { validator: rule.overLength, trigger: 'blur' },
    {
      required: true,
      message: '描述不能为空',
      trigger: 'blur',
    },
  ],
  sortOrder: [
    { validator: rule.overLength, trigger: 'blur' },
    {
      required: true,
      message: '排序不能为空',
      trigger: 'blur',
    },
  ],
})

// 打开弹窗
const openDialog = (row: any, dictForm: any) => {
  visible.value = true
  dataForm.id = ''

  nextTick(() => {
    dicDialogFormRef.value?.resetFields()
    if (dictForm) {
      dataForm.dictId = dictForm.dictId
      dataForm.dictType = dictForm.dictType
    }
  })
  if (row?.id) {
    getItemObj(row.id).then((res) => {
      Object.assign(dataForm, res.data)
    })
  }
}

// 提交
const onSubmit = async () => {
  const valid = await dicDialogFormRef.value.validate().catch(() => {})
  if (!valid) return false

  try {
    loading.value = true
    dataForm.id ? await putItemObj(dataForm) : await addItemObj(dataForm)
    useMessage().success(t(dataForm.id ? 'common.editSuccessText' : 'common.addSuccessText'))
    visible.value = false
    emit('refresh')
  } catch (err: any) {
    useMessage().error(err.msg)
  } finally {
    loading.value = false
  }
}

// 暴露变量
defineExpose({
  openDialog,
})
</script>
