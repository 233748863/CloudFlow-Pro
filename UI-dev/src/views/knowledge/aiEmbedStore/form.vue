<template>
	<el-dialog width="40%" :title="form.storeId ? '编辑' : '新增'" v-model="visible" :close-on-click-modal="false" draggable>
		<el-form ref="dataFormRef" :model="form" :rules="dataRules" formDialogRef label-width="90px" v-loading="loading">
			<el-row :gutter="24">
				<el-col :span="24" class="mb20">
					<el-form-item label="类型" prop="storeType">
						<el-select v-model="form.storeType" placeholder="请选择类型">
							<el-option :label="item.label" :value="item.value" v-for="(item, index) in embed_store_type" :key="index"></el-option>
						</el-select>
					</el-form-item>
				</el-col>

				<el-col :span="24" class="mb20">
					<el-form-item label="名称" prop="name">
						<el-input v-model="form.name" placeholder="请输入名称" />
					</el-form-item>
				</el-col>

				<el-col :span="24" class="mb20" v-if="form.storeType !== 'qdrant' && form.storeType !== 'redis'">
					<el-form-item label="URI" prop="uri">
						<el-input v-model="form.uri" placeholder="请输入链接地址" />
					</el-form-item>
				</el-col>

				<el-col :span="24" class="mb20" v-if="form.storeType === 'qdrant' || form.storeType === 'redis'">
					<el-form-item label="Host" prop="host">
						<el-input v-model="form.host" placeholder="请输入Host" />
					</el-form-item>
				</el-col>

				<el-col :span="24" class="mb20" v-if="form.storeType === 'qdrant' || form.storeType === 'redis'">
					<el-form-item label="端口" prop="port">
						<el-input-number v-model="form.port" placeholder="请输入端口" />
					</el-form-item>
				</el-col>

				<el-col :span="24" class="mb20">
					<el-form-item label="密钥" prop="apiKey">
						<el-input v-model="form.apiKey" placeholder="请输入密钥" />
					</el-form-item>
				</el-col>

				<el-col :span="24" class="mb20" v-if="form.storeType === 'milvus'">
					<el-form-item label="数据库" prop="extData">
						<el-input v-model="form.extData" placeholder="请输入数据库" />
					</el-form-item>
				</el-col>

				<el-col :span="24" class="mb20">
					<el-form-item prop="useTls" v-if="form.storeType === 'qdrant'">
						<template #label> TLS<tip content="HTTPS安全认证" /> </template>
						<el-radio-group v-model="form.useTls">
							<el-radio :key="index" :label="item.value" border v-for="(item, index) in yes_no_type">{{ item.label }} </el-radio>
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

<script setup lang="ts" name="AiEmbedStoreDialog">
import { useDict } from '/@/hooks/dict';
import { useMessage } from '/@/hooks/message';
import { getObj, addObj, putObj, validateExist } from '/@/api/knowledge/aiEmbedStore';
const emit = defineEmits(['refresh']);

// 定义变量内容
const dataFormRef = ref();
const visible = ref(false);
const loading = ref(false);
// 定义字典
const { embed_store_type, yes_no_type } = useDict('embed_store_type', 'yes_no_type');

// 提交表单数据
const form = reactive({
	storeId: '',
	name: '',
	storeType: 'qdrant',
	host: '127.0.0.1',
	port: 6334,
	uri: 'http://127.0.0.1:19530',
	apiKey: '',
	extData: 'default',
	useTls: '0',
});

// 定义校验规则
const dataRules = ref({
	name: [
		{ required: true, message: '名称不能为空', trigger: 'blur' },
		{ max: 64, message: '长度不能超过64个字符', trigger: 'blur' },
		{
			validator: (rule: any, value: any, callback: any) => {
				validateExist(rule, value, callback, form.storeId !== '');
			},
			trigger: 'blur',
		},
	],
	storeType: [{ required: true, message: '类型不能为空', trigger: 'blur' }],
	host: [
		{ required: true, message: 'Host不能为空', trigger: 'blur' },
		{ max: 255, message: '长度不能超过255个字符', trigger: 'blur' },
	],
	port: [
		{ required: true, message: '端口不能为空', trigger: 'blur' },
		{ type: 'number', max: 65535, message: '端口不能超过65535', trigger: 'blur' },
	],
	uri: [
		{ required: true, message: '地址不能为空', trigger: 'blur' },
		{ max: 255, message: '长度不能超过255个字符', trigger: 'blur' },
	],
	extData: [
		{ max: 255, message: '长度不能超过255个字符', trigger: 'blur' },
	],
});

// 打开弹窗
const openDialog = (id: string) => {
	visible.value = true;
	form.storeId = '';

	// 重置表单数据
	nextTick(() => {
		dataFormRef.value?.resetFields();
	});

	// 获取aiEmbedStore信息
	if (id) {
		form.storeId = id;
		getaiEmbedStoreData(id);
	}
};

// 提交
const onSubmit = async () => {
	const valid = await dataFormRef.value.validate().catch(() => {});
	if (!valid) return false;

	try {
		loading.value = true;
		if (form.apiKey?.includes('***')) form.apiKey = undefined;
		form.storeId ? await putObj(form) : await addObj(form);
		useMessage().success(form.storeId ? '修改成功' : '添加成功');
		visible.value = false;
		emit('refresh');
	} catch (err: any) {
		useMessage().error(err.msg);
	} finally {
		loading.value = false;
	}
};

// 初始化表单数据
const getaiEmbedStoreData = (id: string) => {
	// 获取数据
	loading.value = true;
	getObj({ storeId: id })
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
