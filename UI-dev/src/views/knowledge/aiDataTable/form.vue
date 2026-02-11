<template>
	<el-dialog :title="form.tableId ? '编辑' : '新增'" v-model="visible" :width="600" :close-on-click-modal="false" draggable>
		<el-form ref="dataFormRef" :model="form" :rules="dataRules" formDialogRef label-width="120px" v-loading="loading">
			<el-form-item label="数据源" prop="dsName">
				<el-input v-model="form.dsName" disabled placeholder="请输入关联数据源名称" />
			</el-form-item>

			<el-form-item label="表名称" prop="tableName">
				<el-input v-model="form.tableName" disabled placeholder="请输入表名称" />
			</el-form-item>

			<el-form-item label="物理注释" prop="tableComment">
				<el-input type="textarea" disabled rows="4" v-model="form.tableComment" placeholder="请输入物理表注释" />
			</el-form-item>

			<el-form-item label="逻辑注释" prop="virtualComment">
				<el-input type="textarea" rows="4" v-model="form.virtualComment" placeholder="请输入逻辑表注释" />
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

<script setup lang="ts" name="AiDataTableDialog">
import { useMessage } from '/@/hooks/message';
import { getObj, addObj, putObj } from '/@/api/knowledge/aiDataTable';
const emit = defineEmits(['refresh']);

// 定义变量内容
const dataFormRef = ref();
const visible = ref(false);
const loading = ref(false);
// 定义字典

// 提交表单数据
const form = reactive({
	tableId: '',
	dsName: '',
	tableName: '',
	tableComment: '',
	virtualComment: '',
});

// 定义校验规则
const dataRules = ref({
	dsName: [{ required: true, message: '请输入关联数据源名称', trigger: 'blur' }],
	tableName: [{ required: true, message: '请输入表名称', trigger: 'blur' }],
	virtualComment: [{ required: true, message: '请输入虚拟表注释', trigger: 'blur' }],
});

// 打开弹窗
const openDialog = (id: string) => {
	visible.value = true;
	form.tableId = '';

	// 重置表单数据
	nextTick(() => {
		dataFormRef.value?.resetFields();
	});

	// 获取aiDataTable信息
	if (id) {
		form.tableId = id;
		getaiDataTableData(id);
	}
};

// 提交
const onSubmit = async () => {
	const valid = await dataFormRef.value.validate().catch(() => {});
	if (!valid) return false;

	try {
		loading.value = true;
		form.tableId ? await putObj(form) : await addObj(form);
		useMessage().success(form.tableId ? '修改成功' : '添加成功');
		visible.value = false;
		emit('refresh');
	} catch (err: any) {
		useMessage().error(err.msg);
	} finally {
		loading.value = false;
	}
};

// 初始化表单数据
const getaiDataTableData = (id: string) => {
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
