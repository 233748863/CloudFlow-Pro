<template>
	<el-dialog :title="form.id ? '编辑' : '新增'" v-model="visible" :close-on-click-modal="false" draggable>
		<el-form ref="dataFormRef" :model="form" :rules="dataRules" formDialogRef label-width="90px" v-loading="loading">
			<el-row :gutter="24">
				<el-col :span="12" class="mb20">
					<el-form-item label="供应商" prop="provider">
						<el-select v-model="form.provider" placeholder="请选择供应商" @change="handleProviderChange">
							<el-option v-for="provider in providers" :key="provider.value" :label="provider.label" :value="provider.value"></el-option>
						</el-select>
					</el-form-item>
				</el-col>

				<el-col :span="12" class="mb20">
					<el-form-item label="类型" prop="modelType">
						<el-select v-model="form.modelType" placeholder="请选择类型">
							<el-option v-for="type in modelTypes" :key="type.value" :label="type.label" :value="type.value"></el-option>
						</el-select>
					</el-form-item>
				</el-col>

				<el-col :span="12" class="mb20">
					<el-form-item prop="modelName">
						<template #label>模型<tip content="模型平台的标准名称，请选择对应模型"></tip> </template>
						<el-select
							v-model="form.modelName"
							placeholder="请选择模型名称"
							filterable
							allow-create
						>
							<el-option
								v-for="model in filteredModels"
								:key="model.model"
								:label="model.model"
								:value="model.model"
							></el-option>
						</el-select>
					</el-form-item>
				</el-col>

				<el-col :span="12" class="mb20">
					<el-form-item prop="name">
						<template #label
							>别名
							<tip content="模型别名，方便本平台后续调用"></tip>
						</template>
						<el-input v-model="form.name" placeholder="请输入模型别名" :disabled="form.id !== ''" />
					</el-form-item>
				</el-col>

				<template v-if="form.modelType === 'Image'">
					<el-col :span="12" class="mb20">
						<el-form-item label="图片大小" prop="imageSize">
							<el-select v-model="form.imageSize" placeholder="请选择图片大小">
								<el-option v-for="size in imageSizes" :key="size" :label="size" :value="size"></el-option>
							</el-select>
						</el-form-item>
					</el-col>

					<el-col :span="12" class="mb20">
						<el-form-item label="图片质量" prop="imageQuality">
							<el-input v-model="form.imageQuality" placeholder="请入图片质量" />
						</el-form-item>
					</el-col>

					<el-col :span="12" class="mb20">
						<el-form-item label="图片风格" prop="imageStyle">
							<el-input v-model="form.imageStyle" placeholder="请输入图片风格" />
						</el-form-item>
					</el-col>
				</template>

				<el-col :span="12" class="mb20">
					<el-form-item label="apiKey" prop="apiKey">
						<template #label
							>apiKey
							<tip content="Olama 随意填写API KEY，但不能为空"></tip>
						</template>
						<el-input v-model="form.apiKey" placeholder="请输入 apiKey" />
					</el-form-item>
				</el-col>

				<el-col :span="12" class="mb20">
					<el-form-item label="baseUrl" prop="baseUrl">
						<el-input v-model="form.baseUrl" placeholder="请输入 baseUrl" />
					</el-form-item>
				</el-col>

				<template v-if="form.modelType === 'Chat'">
					<el-col :span="12" class="mb20">
						<el-form-item label="响应限制" prop="responseLimit">
							<div class="w-full form-control">
								<input type="range" min="0" max="4096" v-model="form.responseLimit" class="range range-primary" />
								<div class="flex justify-between px-2 w-full text-xs">
									<span>0</span>
									<span>4096</span>
								</div>
								<div class="mt-2 text-center">
									<span class="badge">{{ form.responseLimit }}</span>
								</div>
							</div>
						</el-form-item>
					</el-col>

					<el-col :span="12" class="mb20">
						<el-form-item label="随机性" prop="temperature">
							<div class="w-full form-control">
								<input type="range" min="0" max="1" step="0.1" v-model="form.temperature" class="range range-primary" />
								<div class="flex justify-between px-2 w-full text-xs">
									<span>0</span>
									<span>1</span>
								</div>
								<div class="mt-2 text-center">
									<span class="badge">{{ form.temperature }}</span>
								</div>
							</div>
						</el-form-item>
					</el-col>

					<el-col :span="12" class="mb20">
						<el-form-item label="顶层概率" prop="topP">
							<div class="w-full form-control">
								<input type="range" min="0" max="1" step="0.1" v-model="form.topP" class="range range-primary" />
								<div class="flex justify-between px-2 w-full text-xs">
									<span>0</span>
									<span>0.5</span>
									<span>1</span>
								</div>
								<div class="mt-2 text-center">
									<span class="badge">{{ form.topP }}</span>
								</div>
							</div>
						</el-form-item>
					</el-col>
				</template>
			</el-row>
			<el-row>
				<el-col :span="24" class="mb20">
					<el-form-item prop="extData">
						<template #label
							>特殊参数
							<tip content="部分模型参考文档配置" />
						</template>
						<json-editor ref="jsonEditorRef" v-model="form.extData" />
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

<script setup lang="ts" name="AiModelDialog">
import { useMessage } from '/@/hooks/message';
import { getObj, addObj, putObj, validateExist } from '/@/api/knowledge/aiModel';
import { ref, reactive, watch, nextTick, computed } from 'vue';
import { rule } from '/@/utils/validate';
import { modelTypes, providers, providerModels, providerBaseURLMap } from './model';
// @ts-ignore
import JsonEditor from '@axolo/json-editor-vue';

const emit = defineEmits(['refresh']);

// 定义变量内容
const dataFormRef = ref();
const visible = ref(false);
const loading = ref(false);

// 提交表单数据
const form = reactive({
	id: '',
	modelType: '',
	modelName: '',
	provider: '',
	name: '',
	responseLimit: 2048,
	temperature: 0.7,
	topP: 0.9,
	apiKey: '',
	baseUrl: '',
	secretKey: '',
	endpoint: '',
	azureDeploymentName: '',
	geminiProject: '',
	geminiLocation: '',
	imageSize: '',
	imageQuality: '',
	imageStyle: '',
	defaultModel: '1',
	extData: `{}`,
});

// 可用模型列表
const availableModels = ref<{ type: string; model: string }[]>([]);

// 处理供应商变化
const handleProviderChange = (provider: string) => {
	availableModels.value = providerModels[provider as keyof typeof providerModels] || [];
};

// 监听 provider 变化，自动更新 baseURL
watch(
	() => form.provider,
	(newProvider) => {
		form.baseUrl = providerBaseURLMap[newProvider as keyof typeof providerBaseURLMap] || '';
		handleProviderChange(newProvider);
	}
);

// 定义校验规则
const dataRules = ref({
	modelType: [
		{ required: true, message: '请输入模型类型', trigger: 'blur' },
		{ validator: rule.overLength, trigger: 'blur' },
	],
	modelName: [
		{ required: true, message: '请输入模型名称', trigger: 'blur' },
		{ validator: rule.overLength, trigger: 'blur' },
	],
	provider: [
		{ required: true, message: '请输入供应商', trigger: 'blur' },
		{ validator: rule.overLength, trigger: 'blur' },
	],
	name: [
		{ required: true, message: '请输入模型别名', trigger: 'blur' },
		{ max: 100, message: '模型别名最多100个字符', trigger: 'blur' },
		{
			validator: (rule, value, callback) => validateExist(rule, value, callback, !!form.id),
			trigger: 'blur',
		},
	],
	apiKey: [
		{ required: true, message: '请输入apiKey', trigger: 'blur' },
    { validator: rule.noChinese, trigger: 'blur' },
		{ max: 255, message: 'ApiKey最多255个字符', trigger: 'blur' },
	],
	baseUrl: [
		{ required: true, message: '请输入baseUrl', trigger: 'blur' },
		{ validator: rule.overLength, trigger: 'blur' },
	],
	imageSize: [{ required: true, message: '请选择图片大小', trigger: 'change' }],
	extData: [{ validator: rule.json, trigger: 'blur' }],
	// ... 其他字段的验证规则 ...
});

// 打开弹窗
const openDialog = (id?: string) => {
	visible.value = true;
	form.id = '';

	// 重置表单数据
	nextTick(() => {
		dataFormRef.value?.resetFields();
		availableModels.value = []; // 重置可用模型列表
	});

	// 获取aiModel信息
	if (id) {
		form.id = id;
		getAiModelData(id);
	} else {
		// Reset the name field when adding a new model
		form.name = '';
		form.provider = '';
		form.modelName = '';
		form.modelType = '';
	}
};

// 提交
const onSubmit = async () => {
	const valid = await dataFormRef.value.validate().catch(() => {});
	if (!valid) return false;

	try {
		loading.value = true;
		if (form.apiKey?.includes('***')) form.apiKey = undefined;
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
const getAiModelData = (id: string) => {
	// 获取数据
	loading.value = true;
	getObj(id)
		.then((res: any) => {
			// 先设置 provider
			form.provider = res.data.provider;

			// 设置可用模型列表
			handleProviderChange(form.provider);

			// 设置 modelType
			form.modelType = res.data.modelType;

			// 确保 filteredModels 已更新
			nextTick(() => {
				// 然后设置其他表单数据，包括 modelName
				Object.assign(form, res.data);
			});
		})
		.finally(() => {
			loading.value = false;
		});
};

// 暴露变量
defineExpose({
	openDialog,
});

// Add this to your existing constants
const imageSizes = ['1024x1024', '512x1024', '768x512', '768x1024', '1024x576', '576x1024'];

// Add a computed property for filtered models based on selected type
const filteredModels = computed(() => {
	return availableModels.value.filter((model) => model.type === form.modelType);
});

// Add a watcher for modelType to reset modelName when type changes
watch(
	() => form.modelType,
	() => {
		form.modelName = '';
	}
);
</script>
