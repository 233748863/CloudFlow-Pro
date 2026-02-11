<template>
	<el-dialog :title="form.id ? '编辑' : '新增'" v-model="visible" :width="600" :close-on-click-modal="false" draggable class="dark:bg-gray-800">
		<el-form ref="dataFormRef" :model="form" :rules="dataRules" formDialogRef label-width="90px" v-loading="loading" class="dark:text-gray-300">
			<el-collapse v-model="activeNames" class="dark:border-gray-700">
				<el-collapse-item name="1" class="dark:border-gray-700">
					<el-row :gutter="24">
						<el-col :span="24" class="mb20">
							<el-form-item label="知识库" prop="datasetId" class="dark:text-gray-300">
								<el-select v-model="form.datasetId" placeholder="请选择知识库" class="dark:bg-gray-700">
									<el-option v-for="item in datasetList" :key="item.id" :label="item.name" :value="item.id" class="dark:hover:bg-gray-600" />
								</el-select>
							</el-form-item>
						</el-col>
						<el-col :span="24" class="mb20">
							<el-form-item label="来源" prop="sourceType" class="dark:text-gray-300">
								<el-radio-group v-model="form.sourceType" class="dark:text-gray-300">
									<el-radio v-for="item in source_type" :key="item.value" :label="item.value" border class="dark:border-gray-600 dark:text-gray-300">
										{{ item.label }}
									</el-radio>
								</el-radio-group>
							</el-form-item>
						</el-col>
					</el-row>
				</el-collapse-item>

				<el-collapse-item name="2" v-if="visible" class="dark:border-gray-700">
					<TextDocumentForm v-if="form.sourceType === '2'" v-model="form" />
					<FileDocumentForm v-else-if="form.sourceType === '1'" v-model="form.files" />
					<QADocumentForm v-else-if="form.sourceType === '3'" v-model="form.files" />
					<IssueDocumentForm v-else-if="form.sourceType === '4'" v-model="form" />
				</el-collapse-item>

				<el-collapse-item name="3" class="dark:border-gray-700">
					<el-row :gutter="24">
						<el-col :span="24" class="mb20">
							<el-form-item label="有效" prop="fileStatus" class="dark:text-gray-300">
								<el-radio-group v-model="form.fileStatus" class="dark:text-gray-300">
									<el-radio v-for="item in yes_no_type" :key="item.value" :label="item.value" border class="dark:border-gray-600 dark:text-gray-300">
										{{ item.label }}
									</el-radio>
								</el-radio-group>
							</el-form-item>
						</el-col>
					</el-row>
				</el-collapse-item>
			</el-collapse>
		</el-form>
		<template #footer>
			<span class="dialog-footer">
				<el-button @click="visible = false" class="dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"> 取消 </el-button>
				<el-button type="primary" @click="onSubmit" :disabled="loading" class="dark:border-gray-600"> 确认 </el-button>
			</span>
		</template>
	</el-dialog>
</template>

<script setup lang="ts" name="AiDocumentDialog">
import { defineAsyncComponent } from 'vue';
import { useDict } from '/@/hooks/dict';
import { useMessage } from '/@/hooks/message';
import { getObj, addObj, putObj } from '/@/api/knowledge/aiDocument';
import { fetchDataList } from '/@/api/knowledge/aiDataset';
import { rule } from '/@/utils/validate';

const TextDocumentForm = defineAsyncComponent(() => import('./sources/TextDocumentForm.vue'));
const FileDocumentForm = defineAsyncComponent(() => import('./sources/FileDocumentForm.vue'));
const QADocumentForm = defineAsyncComponent(() => import('./sources/QADocumentForm.vue'));
const IssueDocumentForm = defineAsyncComponent(() => import('./sources/IssueDocumentForm.vue'));

const emit = defineEmits(['refresh']);

// 定义变量内容
const { yes_no_type, source_type } = useDict('yes_no_type', 'source_type');
const dataFormRef = ref();
const route = useRoute();
const visible = ref(false);
const loading = ref(false);
const fileType = ref(['jpeg', 'png', 'jpg', 'gif', 'md', 'doc', 'xls', 'ppt', 'txt', 'pdf', 'docx', 'xlsx', 'pptx', 'html']);
// 定义字典

// 提交表单数据
const form = reactive({
	id: '',
	name: '',
	datasetId: '',
	fileType: '',
	content: '',
	files: [],
	sourceType: '1',
	sliceCount: '',
	hitCount: '',
	fileSize: '',
	fileStatus: '1',
	repoType: '',
	repoOwner: '',
	repoName: '',
	accessToken: '',
});

// 定义校验规则
const dataRules = ref({
	datasetId: [{ required: true, message: '所属知识库不能为空', trigger: 'blur' }],
	name: [
		{ validator: rule.overLength, trigger: 'blur' },
		{ required: true, message: '文件名不能为空', trigger: 'blur' },
	],
	content: [
		{ required: true, message: '内容不能为空', trigger: 'blur' },
		{
			min: 100,
			max: 1800,
			message: '文本长度在 100 - 1800 之间',
			trigger: 'blur',
		},
	],
	repoType: [
		{ required: true, message: '请选择仓库类型', trigger: 'change' },
		{ validator: rule.overLength, trigger: 'blur' },
	],
	repoOwner: [
		{ required: true, message: '请输入仓库拥有者', trigger: 'blur' },
		{ validator: rule.overLength, trigger: 'blur' },
	],
	repoName: [
		{ required: true, message: '请输入仓库名称', trigger: 'blur' },
		{ validator: rule.overLength, trigger: 'blur' },
	],
	accessToken: [
		{ required: true, message: '请输入令牌', trigger: 'blur' },
		{ validator: rule.overLength, trigger: 'blur' },
	],
	files: [
		{
			validator: (rule: any, value: any, callback: any) => {
				if (form.sourceType === '1' && (!form.files || form.files.length === 0)) {
					callback(new Error('文件不能为空'));
				} else {
					callback();
				}
			},
			trigger: 'change',
		},
	],
});
// 打开弹窗
const openDialog = (id: string) => {
	visible.value = true;
	form.id = '';
	form.files = [];

	// 重置表单数据
	nextTick(() => {
		dataFormRef.value?.resetFields();
	});

	getDatasetList();

	// 获取aiDocument信息
	if (id) {
		form.id = id;
		getAiDocumentData(id);
	}
};

// 监听 form.sourceType 变化，如果 sourceType === 1 则打开 excelUploadRef.show()
watch(
	() => form.sourceType,
	(value, _) => {
		if (value === '3') {
			fileType.value = ['xlsx'];
		} else {
			fileType.value = ['jpeg', 'png', 'jpg', 'gif', 'md', 'doc', 'xls', 'ppt', 'txt', 'pdf', 'docx', 'xlsx', 'pptx', 'html'];
		}
	}
);

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

const datasetList = ref<{ id: string; name: string }[]>([]);
const getDatasetList = async () => {
	const { data } = await fetchDataList();
	datasetList.value = data;
};

// 初始化表单数据
const getAiDocumentData = (id: string) => {
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

onMounted(() => {
	const datasetId = route.query.datasetId;
	if (typeof datasetId === 'string') {
		form.datasetId = datasetId;
	}
});
// 暴露变量
defineExpose({
	openDialog,
});

// 新增的响应式变量
const activeNames = ref(['1', '2', '3']);
</script>
