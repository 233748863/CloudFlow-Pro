<template>
    <el-dialog :title="form.id ? '编辑' : '新增'" v-model="visible"
      :close-on-click-modal="false" draggable>
      <el-form ref="dataFormRef" :model="form" :rules="dataRules" formDialogRef label-width="90px" v-loading="loading">
       <el-row :gutter="24">
    <el-col :span="12" class="mb20">
      <el-form-item label="用户ID" prop="userId">
        <el-input v-model="form.userId" placeholder="请输入用户ID"/>
      </el-form-item>
      </el-col>

    <el-col :span="12" class="mb20">
      <el-form-item label="提示令牌数量" prop="promptTokens">
        <el-input v-model="form.promptTokens" placeholder="请输入提示令牌数量"/>
      </el-form-item>
      </el-col>

    <el-col :span="12" class="mb20">
      <el-form-item label="补全令牌数量" prop="completionTokens">
        <el-input v-model="form.completionTokens" placeholder="请输入补全令牌数量"/>
      </el-form-item>
      </el-col>

    <el-col :span="12" class="mb20">
      <el-form-item label="模型名称" prop="model">
        <el-input v-model="form.model" placeholder="请输入模型名称"/>
      </el-form-item>
      </el-col>

    <el-col :span="12" class="mb20">
      <el-form-item label="请求ID" prop="reqid">
        <el-input v-model="form.reqid" placeholder="请输入请求ID"/>
      </el-form-item>
      </el-col>

    <el-col :span="12" class="mb20">
      <el-form-item label="IP地址" prop="ip">
        <el-input v-model="form.ip" placeholder="请输入IP地址"/>
      </el-form-item>
      </el-col>

    <el-col :span="12" class="mb20">
      <el-form-item label="备注" prop="note">
        <el-input v-model="form.note" placeholder="请输入备注"/>
      </el-form-item>
      </el-col>

    <el-col :span="12" class="mb20">
      <el-form-item label="令牌ID" prop="tokenId">
        <el-input v-model="form.tokenId" placeholder="请输入令牌ID"/>
      </el-form-item>
      </el-col>

    <el-col :span="12" class="mb20">
      <el-form-item label="令牌数量" prop="tokens">
        <el-input v-model="form.tokens" placeholder="请输入令牌数量"/>
      </el-form-item>
      </el-col>

    <el-col :span="12" class="mb20">
      <el-form-item label="令牌类型 0 系统  1 用户" prop="tokenType">
        <el-input v-model="form.tokenType" placeholder="请输入令牌类型 0 系统  1 用户"/>
      </el-form-item>
      </el-col>

			</el-row>
      </el-form>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="visible = false">取消</el-button>
          <el-button type="primary" @click="onSubmit" :disabled="loading">确认</el-button>
        </span>
      </template>
    </el-dialog>
</template>

<script setup lang="ts" name="AiBillDialog">
import { useDict } from '/@/hooks/dict';
import { useMessage } from "/@/hooks/message";
import { getObj, addObj, putObj } from '/@/api/knowledge/aiBill'
import { rule } from '/@/utils/validate';
const emit = defineEmits(['refresh']);

// 定义变量内容
const dataFormRef = ref();
const visible = ref(false)
const loading = ref(false)
// 定义字典
const { yes_no_type } = useDict('yes_no_type')

// 提交表单数据
const form = reactive({
		id:'',
	  userId: '',
	  promptTokens: '',
	  completionTokens: '',
	  model: '',
	  reqid: '',
	  ip: '',
	  note: '',
	  tokenId: '',
	  tokens: '',
	  tokenType: '',
});

// 定义校验规则
const dataRules = ref({
})

// 打开弹窗
const openDialog = (id: string) => {
  visible.value = true
  form.id = ''

  // 重置表单数据
	nextTick(() => {
		dataFormRef.value?.resetFields();
	});

  // 获取aiBill信息
  if (id) {
    form.id = id
    getaiBillData(id)
  }
};

// 提交
const onSubmit = async () => {
	const valid = await dataFormRef.value.validate().catch(() => {});
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
const getaiBillData = (id: string) => {
  // 获取数据
  loading.value = true
  getObj(id).then((res: any) => {
    Object.assign(form, res.data)
  }).finally(() => {
    loading.value = false
  })
};

// 暴露变量
defineExpose({
  openDialog
});
</script>