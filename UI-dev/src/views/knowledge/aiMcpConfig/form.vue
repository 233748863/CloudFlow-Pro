<template>
	<el-dialog :title="form.mcpId ? '编辑' : '新增'" v-model="visible" :close-on-click-modal="false" draggable>
		<el-form ref="dataFormRef" :model="form" :rules="dataRules" formDialogRef label-width="100px" v-loading="loading">
			<el-row :gutter="24">
				<el-col :span="24" class="mb20">
					<el-form-item prop="name">
						<template #label> 服务名称<tip content="需要对应MCP服务器名称" /> </template>
						<el-input v-model="form.name" placeholder="请输入服务器名称" />
					</el-form-item>
				</el-col>

				<el-col :span="24" class="mb20">
					<el-form-item label="描述" prop="description">
						<el-input type="textarea" :rows="3" v-model="form.description" placeholder="请输入描述" />
					</el-form-item>
				</el-col>

				<el-col :span="24" class="mb20">
					<el-form-item label="类型" prop="mcpType">
						<el-radio-group v-model="form.mcpType">
							<el-radio label="SSE" border>SSE</el-radio>
							<el-radio label="STDIO" border>STDIO</el-radio>
						</el-radio-group>
					</el-form-item>
				</el-col>

				<el-col :span="24" class="mb20">
					<el-form-item label="命令" prop="command">
						<template #label> 命令<tip content="服务器必须已经安装了此命令" /> </template>
						<el-select v-model="form.command">
							<el-option key="npx" label="npx" value="npx" />
							<el-option key="java" label="java" value="java" />
							<el-option key="docker" label="docker" value="docker" />
						</el-select>
					</el-form-item>
				</el-col>

				<el-col :span="24" class="mb20">
					<el-form-item prop="parameters">
						<template #label> 参数 <tip content="参数一行一个" /> </template>
						<code-editor v-model="form.parameters" mode="velocity" class="w-full" height="100"></code-editor>
					</el-form-item>
				</el-col>

				<el-col :span="24" class="mb20">
					<el-form-item prop="environmentVariables">
						<template #label> 环境变量 <tip content="变量一行一个" /> </template>
						<code-editor v-model="form.environmentVariables" mode="velocity" class="w-full" height="100"></code-editor>
					</el-form-item>
				</el-col>

				<el-col :span="24" class="mb20">
					<el-form-item label="启用" prop="mcpEnabled">
						<el-radio-group v-model="form.mcpEnabled">
							<el-radio :label="item.value" v-for="(item, index) in yes_no_type" border :key="index">{{ item.label }} </el-radio>
						</el-radio-group>
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

<script setup lang="ts" name="AiMcpConfigDialog">
import { useDict } from '/@/hooks/dict';
import { useMessage } from '/@/hooks/message';
import { getObj, addObj, putObj } from '/@/api/knowledge/aiMcpConfig';
import { rule } from '/@/utils/validate';
const emit = defineEmits(['refresh']);
const CodeEditor = defineAsyncComponent(() => import('/@/components/CodeEditor/index.vue'));

// 定义变量内容
const dataFormRef = ref();
const visible = ref(false);
const loading = ref(false);
// 定义字典
const { yes_no_type } = useDict('yes_no_type');

// 提交表单数据
const form = reactive({
	mcpId: '',
	name: '',
	description: '',
	mcpType: 'STDIO',
	command: 'npx',
	parameters: '',
	environmentVariables: undefined ,
	mcpEnabled: '1',
});

// 定义校验规则
const dataRules = ref({
	name: [
		{ required: true, message: '服务器名称不能为空', trigger: 'blur' },
		{ max: 100, message: '服务器名称不能超过100个字符', trigger: 'blur' },
	],
	mcpType: [{ required: true, message: '类型 (SSE: Server-Sent Events, STDIO: Standard Input/Output)不能为空', trigger: 'blur' }],
	command: [{ required: true, message: '命令不能为空', trigger: 'blur' }],
	mcpEnabled: [{ required: true, message: '是否启用（1：启用，0：禁用）不能为空', trigger: 'blur' }],
});

// 打开弹窗
const openDialog = (id: string) => {
	visible.value = true;
	form.mcpId = '';

	// 重置表单数据
	nextTick(() => {
		dataFormRef.value?.resetFields();
	});

	// 获取aiMcpConfig信息
	if (id) {
		form.mcpId = id;
		getaiMcpConfigData(id);
	}
};

// 提交
const onSubmit = async () => {
	const valid = await dataFormRef.value.validate().catch(() => {});
	if (!valid) return false;

	try {
		loading.value = true;
    form.environmentVariables = form.environmentVariables?.includes('***') ? undefined : form.environmentVariables;
    form.mcpId ? await putObj(form) : await addObj(form);
		useMessage().success(form.mcpId ? '修改成功' : '添加成功');
		visible.value = false;
		emit('refresh');
	} catch (err: any) {
		useMessage().error(err.msg);
	} finally {
		loading.value = false;
	}
};

// 初始化表单数据
const getaiMcpConfigData = (id: string) => {
	// 获取数据
	loading.value = true;
	getObj(id)
		.then((res: any) => {
			Object.assign(form, res.data);
		})
		.finally(() => {
			loading.value = false;
		});
};

// 暴露变量
defineExpose({
	openDialog,
});
</script>
