<template>
  <el-dialog
      v-model="dialogVisible"
      title="标记信息"
      width="30%"
      :close-on-click-modal="false"
  >
    <el-form :model="form" :rules="rules" ref="formRef">
      <el-form-item prop="name" label="字段名" :label-width="formLabelWidth">
        <el-input v-model="form.name" autocomplete="off"></el-input>
      </el-form-item>
      <el-form-item prop="description" label="字段描述" :label-width="formLabelWidth">
        <el-input
            v-model="form.description"
            type="textarea"
            :rows="4"
            placeholder="请输入描述"
        ></el-input>
      </el-form-item>
    </el-form>
    <template #footer>
      <span class="dialog-footer">
        <el-button @click="closeDialog">取消</el-button>
        <el-button type="primary" @click="submitForm">确认</el-button>
      </span>
    </template>
  </el-dialog>
</template>

<script setup>
import {rule} from "/@/utils/validate";

const props = defineProps({
  initialName: String,
  initialDescription: String,
});

const emit = defineEmits(['submit', 'close']);

const dialogVisible = ref(false);
const formRef = ref(null);
const form = reactive({
  name: props.initialName || '',
  description: props.initialDescription || ''
});

const rules = {
  name: [
    {required: true, message: '请输入属性名', trigger: 'blur'},
    {validator: rule.overLength, trigger: 'blur'},
    {validator: rule.validatorLowercase, trigger: 'blur'}
  ],
  description: [
    {required: true, message: '请输入描述', trigger: 'blur'},
    {validator: rule.overLength, trigger: 'blur'},
  ]
};

const formLabelWidth = '80px';

const submitForm = () => {
  formRef.value.validate((valid) => {
    if (valid) {
      emit('submit', {name: form.name, description: form.description});
      closeDialog();
    } else {
      return false;
    }
  });
};

const closeDialog = () => {
  dialogVisible.value = false;
  emit('close');
};

const showDialog = (name, description) => {
  form.name = name || '';
  form.description = description || '';
  dialogVisible.value = true;
};

defineExpose({showDialog});
</script>
