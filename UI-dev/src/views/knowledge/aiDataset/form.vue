<template>
	<el-drawer v-model="visible" :title="form.id ? '编辑' : '新增'" size="50%">
		<el-form ref="dataFormRef" :model="form" :rules="dataRules" label-width="auto" v-loading="loading">
			<el-row>
				<el-col :span="12" class="mb20">
					<el-form-item label="名称" prop="name">
						<el-input v-model="form.name" maxlength="20" placeholder="请输入名称" />
					</el-form-item>
					<el-form-item prop="sortOrder">
						<template #label>
							排序值
							<tip content="越大展示越靠前" />
						</template>
						<el-input-number v-model="form.sortOrder" :min="1" :max="9999" :step="1" />
					</el-form-item>
				</el-col>
				<el-col :span="12" class="mb20">
					<el-form-item label="封面" prop="avatarUrl">
						<upload-img v-model:image-url="form.avatarUrl" borderRadius="50%" />
					</el-form-item>
				</el-col>
			</el-row>
			<el-row>
				<el-col :span="24" class="mb20">
					<el-form-item label="欢迎语" prop="welcomeMsg">
						<el-input
							v-model="form.welcomeMsg"
							type="textarea"
							placeholder="描述知识库的内容，详尽的描述将帮助AI能深入理解该知识库的内容，能更准确的检索到内容，提高该知识库的命中率。"
							maxlength="1024"
							show-word-limit
							rows="6"
						/>
					</el-form-item>
				</el-col>
			</el-row>
			<el-collapse>
				<el-collapse-item title="高级配置" name="1">
					<el-row :gutter="24">
						<el-col :span="8" class="mb20">
							<el-form-item label="向量库" prop="storeId">
								<el-select v-model="form.storeId" placeholder="请选择向量库" clearable filterable :disabled="form.id !== ''">
									<el-option v-for="item in storeList" :key="item.storeId" :label="item.name" :value="item.storeId" />
								</el-select>
							</el-form-item>
						</el-col>
						<el-col :span="8" class="mb20">
							<el-form-item label="向量模型" prop="embeddingModel">
								<el-select v-model="form.embeddingModel" placeholder="请选择向量模型" clearable filterable :disabled="form.id !== ''">
									<el-option v-for="item in embeddingModelList" :key="item.id" :label="item.name" :value="item.name" />
								</el-select>
							</el-form-item>
						</el-col>
						<el-col :span="8" class="mb20">
							<el-form-item label="总结模型" prop="summaryModel">
								<el-select v-model="form.summaryModel" placeholder="请选择总结模型" clearable filterable>
									<el-option v-for="item in chatModelList" :key="item.id" :label="item.name" :value="item.name" />
								</el-select>
							</el-form-item>
						</el-col>
					</el-row>
					<el-row :gutter="24">
						<el-col :span="8" class="mb20">
							<el-form-item label="多轮会话" prop="multiRound">
								<template #label>
									会话轮数
									<tip content="会话轮数，0代表不记忆上文会话" />
								</template>
								<el-input-number v-model="form.multiRound" :min="0" :max="5" :step="1" />
							</el-form-item>
						</el-col>

						<el-col :span="8" class="mb20">
							<el-form-item prop="topK">
								<template #label>
									匹配条数
									<tip content="向量数据库匹配最多几条结果" />
								</template>
								<el-input-number v-model="form.topK" :min="1" :max="5" :step="1" />
							</el-form-item>
						</el-col>

						<el-col :span="8" class="mb20">
							<el-form-item prop="sortOrder">
								<template #label>
									分片值
									<tip content="分片值取决于模型自身能力,理论上分片值越大越准确" />
								</template>
								<el-input-number v-model="form.fragmentSize" :min="500" :max="9999" :step="1" />
							</el-form-item>
						</el-col>

						<el-col :span="12" class="mb20">
							<el-form-item prop="score">
								<template #label>
									匹配率
									<tip content="向量数据库匹配率，建议不低于 50%" />
								</template>
								<el-slider v-model="form.score" :step="10" :min="10" :max="90" :format-tooltip="(value) => value + '%'" show-stops />
							</el-form-item>
						</el-col>
						<el-col :span="12" class="mb20">
							<el-form-item prop="emptyDesc">
								<template #label>
									空提示
									<tip content="未匹配的时候，返回的文案" />
								</template>
								<el-input v-model="form.emptyDesc" placeholder="请输入描述" />
							</el-form-item>
						</el-col>
					</el-row>

					<el-row :gutter="24">
						<el-col :span="6" class="mb20">
							<el-form-item label="文档总结" prop="preSummary">
								<el-switch v-model="form.preSummary" :active-value="'1'" :inactive-value="'0'" />
							</el-form-item>
						</el-col>
						<el-col :span="6" class="mb20">
							<el-form-item prop="aiOcrFlag">
								<template #label>
									AI OCR
									<tip content="PDF、图片等文件，自动进行 AI OCR 识别" />
								</template>
								<el-switch v-model="form.aiOcrFlag" :active-value="'1'" :inactive-value="'0'" />
							</el-form-item>
						</el-col>
						<el-col :span="6" class="mb20">
							<el-form-item label="会话压缩" prop="preCompress">
								<el-switch v-model="form.preCompress" :active-value="'1'" :inactive-value="'0'" />
							</el-form-item>
						</el-col>
						<el-col :span="6" class="mb20">
							<el-form-item prop="standardFlag">
								<template #label>
									标注数据
									<tip content="使用已经标注修正后的答案，直接返回" />
								</template>
								<el-switch v-model="form.standardFlag" :active-value="'1'" :inactive-value="'0'" />
							</el-form-item>
						</el-col>
					</el-row>
				</el-collapse-item>

				<el-collapse-item title="安全配置">
					<el-row :gutter="24">
						<el-col :span="12" class="mb20">
							<el-form-item label="是否对外" prop="publicFlag">
								<el-switch v-model="form.publicFlag" :active-value="'1'" :inactive-value="'0'" />
							</el-form-item>
						</el-col>
						<el-col :span="12" class="mb20">
							<el-form-item prop="publicPassword">
								<template #label>
									安全密钥
									<tip content="对外服务，需要用户输入的密码" />
								</template>
								<el-input v-model="form.publicPassword" placeholder="请输入密码" />
							</el-form-item>
						</el-col>
					</el-row>

					<el-row :gutter="24">
						<el-col :span="12" class="mb20">
							<el-form-item label="敏感词过滤" prop="sensitiveFlag">
								<el-switch v-model="form.sensitiveFlag" :active-value="'1'" :inactive-value="'0'" />
							</el-form-item>
						</el-col>
						<el-col :span="12" class="mb20">
							<el-form-item prop="sensitiveMsg">
								<template #label>
									提示
									<tip content="命中敏感词，返回的文案" />
								</template>
								<el-input v-model="form.sensitiveMsg" placeholder="请输入描述" />
							</el-form-item>
						</el-col>
					</el-row>

					<el-row :gutter="24">
						<el-col :span="24" class="mb20">
							<el-form-item label="底部信息" prop="footer">
								<el-input type="textarea" maxlength="255" :rows="3" v-model="form.footer" placeholder="聊天框底部的信息，支持 HTML 语法" />
							</el-form-item>
						</el-col>
					</el-row>
				</el-collapse-item>
			</el-collapse>
		</el-form>
		<template #footer>
			<span class="dialog-footer">
				<el-button @click="visible = false">取消</el-button>
				<el-button type="primary" @click="onSubmit" :disabled="loading">确认</el-button>
			</span>
		</template>
	</el-drawer>
</template>

<script setup lang="ts" name="AiDatasetDialog">
import { useDict } from '/@/hooks/dict';
import { useMessage } from '/@/hooks/message';
import { getDetails, addObj, putObj, validateName } from '/@/api/knowledge/aiDataset';
import { list as aiModelList } from '/@/api/knowledge/aiModel';
import { list } from '/@/api/knowledge/aiEmbedStore';
import { rule } from '/@/utils/validate';
import UploadImg from '/@/components/Upload/Image.vue';

const emit = defineEmits(['refresh']);

// 定义变量内容
const dataFormRef = ref();
const visible = ref(false);
const loading = ref(false);
// 定义字典
const { yes_no_type } = useDict('yes_no_type');

// 提交表单数据
const form = reactive({
	id: '',
	name: '',
	avatarUrl: '',
	description: '',
	units: '0',
	fileSize: '0',
	multiRound: 3,
	topK: 2,
	score: 40,
	fragmentSize: 500,
	sortOrder: 1,
	emptyDesc: '知识库未匹配相关问题，请重新提问',
	sensitiveFlag: '1',
	preSummary: '1',
	preCompress: '0',
	sensitiveMsg: '您输入内容包含敏感词，请重新输入',
	publicFlag: '1',
	publicPassword: '',
	standardFlag: '0',
	aiOcrFlag: '1',
	welcomeMsg: '',
	footer: '',
	embeddingModel: '',
	summaryModel: '',
	storeId: '',
});

// 定义校验规则
const dataRules = ref({
	name: [
		{ required: true, message: '知识库名称不能为空', trigger: 'blur' },
		{
			validator: (rule: any, value: any, callback: any) => {
				validateName(rule, value, callback, form.id !== '');
			},
			trigger: 'blur',
		},
	],
	welcomeMsg: [{ required: true, message: '欢迎语不能为空', trigger: 'blur' }],
	multiRound: [{ required: true, message: '多轮会话不能为空', trigger: 'blur' }],
	topK: [{ required: true, message: '多轮会话不能为空', trigger: 'blur' }],
	avatarUrl: [{ required: true, message: '封面不能为空', trigger: 'blur' }],
	emptyDesc: [
		{ validator: rule.overLength, trigger: 'blur' },
		{
			required: true,
			message: '提示不能为空',
			trigger: 'blur',
		},
	],
	sensitiveMsg: [
		{ validator: rule.overLength, trigger: 'blur' },
		{
			required: true,
			message: '提示不能为空',
			trigger: 'blur',
		},
	],
	storeId: [{ required: true, message: '请选择向量库', trigger: 'change' }],
	embeddingModel: [{ required: true, message: '请选择向量模型', trigger: 'change' }],
	summaryModel: [{ required: true, message: '请选择总结模型', trigger: 'change' }],
});

const embeddingModelList = ref<Array<{ id: string; name: string }>>([]);
const chatModelList = ref<Array<{ id: string; name: string }>>([]);
const storeList = ref<Array<{ storeId: string; name: string }>>([]);

// Modify the function to fetch AI models based on modelType
async function loadAiModelList() {
	try {
		const [embeddingResponse, chatResponse] = await Promise.all([
			aiModelList({ modelType: 'Embedding' }),
			aiModelList({ modelType: ['Chat', 'Reason'] }),
		]);

		embeddingModelList.value = embeddingResponse.data.map((item: any) => ({
			id: item.id,
			name: item.name,
			label: item.name,
		}));

		chatModelList.value = chatResponse.data.map((item: any) => ({
			id: item.id,
			name: item.name,
		}));

		// Set default values if lists are not empty
		if (embeddingModelList.value.length > 0 && !form.embeddingModel) {
			form.embeddingModel = embeddingModelList.value[0].name;
		}
		if (chatModelList.value.length > 0 && !form.summaryModel) {
			form.summaryModel = chatModelList.value[0].name;
		}
	} catch (error) {
		useMessage().error('加载AI模型列表失败');
	}
}

// Modify the openDialog function
const openDialog = async (id: string) => {
	visible.value = true;
	form.id = '';

	// Reset form data
	nextTick(() => {
		dataFormRef.value?.resetFields();
	});

	// Load the collection list and AI model list
	await loadAiModelList();

	// 初始化向量库列表
	const { data } = await list();
	storeList.value = data;

	// Set default value for storeId if list is not empty
	if (storeList.value.length > 0 && !form.storeId) {
		form.storeId = storeList.value[0].storeId;
	}

	// Get aiDataset information
	if (id) {
		form.id = id;
		getaiDatasetData(id);
	} else {
		// Set default values for new records
		if (embeddingModelList.value.length > 0) {
			form.embeddingModel = embeddingModelList.value[0].name;
		}
		if (chatModelList.value.length > 0) {
			form.summaryModel = chatModelList.value[0].name;
		}
	}
};

// 提交
const onSubmit = async () => {
	const valid = await dataFormRef.value.validate().catch(() => {});
	if (!valid) return false;

	if (form.id && form.publicPassword?.includes('**')) {
		form.publicPassword = undefined;
	}

	try {
		loading.value = true;
		form.id ? await putObj(form) : await addObj(form);
		useMessage().success(form.id ? '修改成功' : '添加成功');
		visible.value = false;
		emit('refresh');
	} catch (err: any) {
		useMessage().error(err.msg || '操作失败');
	} finally {
		loading.value = false;
	}
};

// 初始化表单数据
const getaiDatasetData = (id: string) => {
	// 获取数据
	loading.value = true;
	getDetails({ id })
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
