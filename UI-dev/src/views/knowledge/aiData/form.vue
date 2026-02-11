<template>
	<el-dialog :title="form.dataId ? '编辑' : '新增'" v-model="visible" :close-on-click-modal="false" :width="600" draggable>
		<el-form ref="dataFormRef" :model="form" :rules="dataRules" formDialogRef label-width="90px" v-loading="loading">
			<el-form-item label="名称" prop="datasetName">
				<el-input v-model="form.datasetName" placeholder="请输入数据集名称" />
			</el-form-item>

			<el-form-item prop="description">
				<template #label> 描述<tip content="非常重要在多个数据集之间，请输入清晰的描述信息，方便大模型自动区分" /> </template>
				<el-input type="textarea" rows="4" v-model="form.description" placeholder="请输入数据集描述" />
			</el-form-item>

			<el-form-item label="数据源" prop="dsName">
				<el-select v-model="form.dsName" placeholder="请选择数据源" @change="handleDsNameChange">
					<el-option label="默认数据源" value="master"></el-option>
					<el-option v-for="ds in datasourceList" :key="ds" :label="ds" :value="ds"></el-option>
				</el-select>
			</el-form-item>

			<el-form-item label="数据表" prop="tableName">
				<el-select
					v-model="form.tableName"
					placeholder="请选择数据表"
					multiple
					filterable
					collapse-tags
					collapse-tags-tooltip
					:max-collapse-tags="3"
					style="width: 100%"
				>
					<el-option :key="table" :label="table" :value="table" v-for="table in tableList"></el-option>
				</el-select>
			</el-form-item>

			<el-form-item label="学习状态" prop="learningStatus">
				<el-radio-group v-model="form.learningStatus">
					<el-radio :label="item.value" v-for="(item, index) in yes_no_type" border :key="index">{{ item.label }} </el-radio>
				</el-radio-group>
			</el-form-item>
		</el-form>
		<template #footer>
			<span class="dialog-footer">
				<el-button @click="visible = false">取消</el-button>
				<el-button type="primary" @click="onSubmit" :disabled="loading">确认</el-button>
			</span>
		</template>
	</el-dialog>
</template>

<script setup lang="ts" name="AiDataDialog">
import { useDict } from '/@/hooks/dict';
import { useMessage } from '/@/hooks/message';
import { getObj, addObj, putObj } from '/@/api/knowledge/aiData';
import { list } from '/@/api/gen/datasource';
import { listTables } from '/@/api/knowledge/aiDataTable';
const emit = defineEmits(['refresh']);

// 定义变量内容
const dataFormRef = ref();
const visible = ref(false);
const loading = ref(false);
// 定义字典
const { yes_no_type } = useDict('yes_no_type');
// 数据源列表
const datasourceList = ref<string[]>([]);
// 数据表列表
const tableList = ref<string[]>([]);

// 提交表单数据
const form = reactive({
	dataId: '',
	datasetName: '',
	description: '',
	datasetType: '',
	dsName: '',
	learningStatus: '0',
	tableName: [],
});

// 定义校验规则
const dataRules = ref({
	datasetName: [
		{ required: true, message: '数据集名称不能为空', trigger: 'blur' },
		{ max: 20, message: '数据集名称不能超过20个字符', trigger: 'blur' },
	],
	description: [
		{ required: true, message: '数据集描述不能为空', trigger: 'blur' },
		{ max: 200, message: '数据集描述不能超过200个字符', trigger: 'blur' },
	],
	dsName: [{ required: true, message: '关联数据源不能为空', trigger: 'blur' }],
	tableName: [{ required: true, message: '关联数据表不能为空', trigger: 'blur' }],
	learningStatus: [{ required: true, message: '学习状态不能为空', trigger: 'blur' }],
});

// 打开弹窗
const openDialog = (id: string) => {
	visible.value = true;
	form.dataId = '';

	// 重置表单数据
	nextTick(() => {
		dataFormRef.value?.resetFields();
	});

	// 加载数据源列表
	loadDatasourceList();

	// 获取aiData信息
	if (id) {
		form.dataId = id;
		getaiDataData(id);
	}
};

// 提交
const onSubmit = async () => {
	const valid = await dataFormRef.value.validate().catch(() => {});
	if (!valid) return false;

	try {
		loading.value = true;
		form.dataId ? await putObj(form) : await addObj(form);
		useMessage().success(form.dataId ? '修改成功' : '添加成功');
		visible.value = false;
		emit('refresh');
	} catch (err: any) {
		useMessage().error(err.msg);
	} finally {
		loading.value = false;
	}
};

// 初始化表单数据
const getaiDataData = (id: string) => {
	// 获取数据
	loading.value = true;
	getObj(id)
		.then((res: any) => {
			Object.assign(form, res.data);
			if (form.dsName) {
				loadTableList(form.dsName);
			}
		})
		.finally(() => {
			loading.value = false;
		});
};

// 加载数据源列表
const loadDatasourceList = async () => {
	try {
		const { data } = await list();
		datasourceList.value = data?.map((item: any) => item.name) || [];
	} catch (error) {
		useMessage().error('加载数据源列表失败');
	}
};

// 加载数据表列表
const loadTableList = async (dsName: string) => {
	if (!dsName) return;

	try {
		const { data } = await listTables(dsName);
		tableList.value = data.map((item: any) => item.tableName) || [];
	} catch (error) {
		useMessage().error('加载数据表列表失败');
	}
};

// 数据源变更处理
const handleDsNameChange = (value: string) => {
	form.tableName = []; // 清空表名
	loadTableList(value);
};

// 暴露变量
defineExpose({
	openDialog,
});
</script>
