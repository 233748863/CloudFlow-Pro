<template>
  <el-dialog :title="form.id ? '编辑' : '新增'" v-model="visible"
             :close-on-click-modal="false" draggable>
    <el-form ref="dataFormRef" :model="form" :rules="dataRules" formDialogRef label-width="90px" v-loading="loading">
      <el-form-item label="标题" prop="ocrTitle">
        <el-input v-model="form.ocrTitle" placeholder="请输入标题"/>
      </el-form-item>

      <el-form-item label="描述" prop="ocrPrompt">
        <el-input type="textarea" :rows="5" v-model="form.ocrPrompt" placeholder="请输入描述提示词"/>
      </el-form-item>

    </el-form>
    <template #footer>
        <span class="dialog-footer">
          <el-button @click="visible = false">取 消</el-button>
          <el-button type="primary" @click="onSubmit" :disabled="loading">确 认</el-button>
        </span>
    </template>
  </el-dialog>
</template>

<script setup lang="ts" name="AiOcrConfDialog">
import {useDict} from '/@/hooks/dict';
import {useMessage} from "/@/hooks/message";
import {getObj, addObj, putObj, validateExist} from '/@/api/knowledge/ocr'
import {rule} from '/@/utils/validate';

const emit = defineEmits(['refresh']);

// 定义变量内容
const dataFormRef = ref();
const visible = ref(false)
const loading = ref(false)
// 定义字典

// 提交表单数据
const form = reactive({
  id: '',
  ocrTitle: '',
  ocrPrompt: '',
  imageResource: '',
  ocrMarked: '',
});

// 定义校验规则
const dataRules = {
  ocrTitle: [
    {required: true, message: '请输入功能名称', trigger: 'blur'},
    {validator: rule.overLength, trigger: 'blur'}
  ],
  ocrPrompt: [
    {required: true, message: '请输入提示词描述', trigger: 'blur'},
    {validator: rule.overLength, trigger: 'blur'},
  ]
};

// 打开弹窗
const openDialog = (id: string) => {
  visible.value = true
  form.id = ''

  // 重置表单数据
  nextTick(() => {
    dataFormRef.value?.resetFields();
  });

  // 获取aiOcrConf信息
  if (id) {
    form.id = id
    getAiOcrConfData(id)
  }
};

// 提交
const onSubmit = async () => {
  const valid = await dataFormRef.value.validate().catch(() => {
  });
  if (!valid) return false;

  try {
    loading.value = true;
    form.id ? await putObj(form) : await addObj(form);
    useMessage().success(form.id ? '修改成功' : '添加成功');
    visible.value = false;
    emit('refresh');
  } catch (err: any) {
    useMessage().error(err.msg);
  } finally {
    loading.value = false;
  }
};


// 初始化表单数据
const getAiOcrConfData = (id: string) => {
  // 获取数据
  loading.value = true
  getObj({id: id}).then((res: any) => {
    Object.assign(form, res.data[0])
  }).finally(() => {
    loading.value = false
  })
};

// 暴露变量
defineExpose({
  openDialog
});
</script>
