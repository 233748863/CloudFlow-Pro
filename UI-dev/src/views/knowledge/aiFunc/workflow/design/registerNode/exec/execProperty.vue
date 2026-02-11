<template>
	<div>
		<div role="alert" class="shadow-lg alert">
			<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" class="w-6 h-6 stroke-info shrink-0">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
			</svg>
			<div>
				<div class="text-xs">您期望大模型从用户输入的信息中，提取出哪些些参数，通过此节点配置。</div>
			</div>
		</div>

		<div class="mt-2">
			<sc-form-table
				ref="formTable"
				v-model="propertyForm.fieldList"
				:addTemplate="{ attrName: '', fieldComment: '', formType: '', formRequired: '1' }"
				placeholder="暂无数据"
			>
				<el-table-column label="属性名" prop="attrName" show-overflow-tooltip>
					<template #default="{ row }">
						<el-input v-model="row.attrName" placeholder="请输入属性名"></el-input>
					</template>
				</el-table-column>
				<el-table-column label="说明" prop="fieldComment" show-overflow-tooltip>
					<template #default="{ row }">
						<el-input v-model="row.fieldComment" placeholder="请输入字段描述"></el-input>
					</template>
				</el-table-column>
				<el-table-column label="类型" prop="formType" show-overflow-tooltip>
					<template #default="{ row }">
						<el-select v-model="row.formType" placeholder="请选择属性类型">
							<el-option v-for="item in typeList" :key="item.value" :label="item.label" :value="item.value" />
						</el-select>
					</template>
				</el-table-column>
				<el-table-column label="必填" prop="formRequired" width="60" show-overflow-tooltip>
					<template #default="{ row }">
						<el-checkbox v-model="row.formRequired" true-label="1" false-label="0"></el-checkbox>
					</template>
				</el-table-column>
			</sc-form-table>
		</div>
	</div>
</template>
<script setup lang="ts">
import { useMessage } from '/@/hooks/message';

const scFormTable = defineAsyncComponent(() => import('/@/components/FormTable/index.vue'));
const typeList = ref([
	{ label: 'string', value: 'string' },
	{ label: 'number', value: 'number' },
	{ label: 'boolean', value: 'boolean' },
	{ label: 'date', value: 'date' },
	{ label: 'list', value: 'list' },
]) as any;

const props = defineProps({
	nodeData: Object,
	lf: Object || String,
	//详情
	flowDetail: {
		type: Object,
		default: () => {
			return {};
		},
	},
});
const emit = defineEmits(['closed']);

let propertyForm = reactive({
	fieldList: [],
});

//确定
const confirmFunc = () => {
	if (propertyForm.fieldList && propertyForm.fieldList.length > 0) {
		props.lf.setProperties(props.nodeData.id, {
			fieldList: propertyForm.fieldList,
			frontend_status: '1', //0配置错误，1配置正常
		});
		useMessage().success('节点信息保存成功');
		emit('closed');
	} else {
		useMessage().error('属性列表不能为空');
	}
};

//取消
const cancelFunc = () => {
	emit('closed');
};

onMounted(() => {
	propertyForm.fieldList = props.nodeData.properties.fieldList;
});

defineExpose({
	confirmFunc,
});
</script>
<style scoped></style>
