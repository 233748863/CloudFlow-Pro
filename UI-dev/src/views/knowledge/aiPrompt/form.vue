<template>
	<el-dialog :title="form.id ? '编辑' : '新增'" v-model="visible" :close-on-click-modal="false" draggable width="40%">
		<el-form ref="dataFormRef" :model="form" :rules="dataRules" formDialogRef label-width="90px" v-loading="loading">
			<el-form-item label="标题" prop="act">
				<el-input v-model="form.act" placeholder="请输入标题" />
			</el-form-item>

			<el-form-item label="列表排序" prop="promptSort">
				<el-input-number v-model.number="form.promptSort" :min="0" placeholder="请输入列表排序" />
			</el-form-item>

			<el-form-item label="是否有效" prop="promptStatus">
				<el-radio-group v-model="form.promptStatus">
					<el-radio v-for="item in yesNoOptions" :key="item.value" :label="item.value" border>
						{{ item.label }}
					</el-radio>
				</el-radio-group>
			</el-form-item>

			<el-form-item label="提示词" prop="prompt">
				<el-input v-model="form.prompt" type="textarea" :rows="6" placeholder="请输入提示词" />
			</el-form-item>
		</el-form>
		<template #footer>
			<span class="dialog-footer">
				<el-button @click="visible = false">取消</el-button>
				<el-button type="primary" @click="onSubmit" :loading="loading">确认</el-button>
			</span>
		</template>
	</el-dialog>
</template>

<script setup lang="ts" name="AiPromptDialog">
import { ref, reactive, nextTick } from 'vue';
import { useDict } from '/@/hooks/dict';
import { useMessage } from '/@/hooks/message';
import { getObj, addObj, putObj } from '/@/api/knowledge/aiPrompt';

const emit = defineEmits(['refresh']);

// 定义变量内容
const dataFormRef = ref();
const visible = ref(false);
const loading = ref(false);

// 定义字典
const { yes_no_type: yesNoOptions } = useDict('yes_no_type');

// 提交表单数据
const form = reactive({
	id: '',
	act: '',
	prompt: '',
	promptSort: 0,
	promptStatus: '1',
});

// 定义校验规则
const dataRules = {
	act: [{ required: true, message: '请输入标题', trigger: 'blur' }],
	prompt: [{ required: true, message: '请输入提示词', trigger: 'blur' }],
	promptSort: [
		{ required: true, message: '请输入列表排序', trigger: 'blur' },
		{ type: 'number', message: '列表排序必须为数字', trigger: 'blur' }
	],
	promptStatus: [{ required: true, message: '请选择是否有效', trigger: 'change' }],
};

// 打开弹窗
function openDialog(id?: string) {
	visible.value = true;
	form.id = '';

	// 重置表单数据
	nextTick(() => {
		dataFormRef.value?.resetFields();
	});

	// 获取aiPrompt信息
	if (id) {
		form.id = id;
		getAiPromptData(id);
	}
}

// 提交
async function onSubmit() {
	const valid = await dataFormRef.value.validate().catch(() => false);
	if (!valid) return;

	try {
		loading.value = true;
		await (form.id ? putObj(form) : addObj(form));
		useMessage().success(form.id ? '修改成功' : '添加成功');
		visible.value = false;
		emit('refresh');
	} catch (err: any) {
		useMessage().error(err.msg);
	} finally {
		loading.value = false;
	}
}

// 初始化表单数据
function getAiPromptData(id: string) {
	loading.value = true;
	getObj(id)
		.then((res: any) => {
			const data = res.data;
			Object.assign(form, {
				...data,
				promptSort: Number(data.promptSort)
			});
		})
		.finally(() => {
			loading.value = false;
		});
}

// 暴露变量
defineExpose({
	openDialog,
});
</script>
