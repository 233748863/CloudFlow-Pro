<template>
	<div>
		<el-form ref="propertyFormRef" :model="propertyForm" :rules="rules" label-width="90px">
			<el-row :gutter="24">
				<el-col :span="24" class="mb20">
					<el-form-item label="函数名称" prop="funcName">
						<el-input v-model="propertyForm.funcName" placeholder="请输入函数名称" />
					</el-form-item>
				</el-col>

				<el-col :span="24" class="mb20">
					<el-form-item label="函数标题" prop="funcTitle">
						<el-input v-model="propertyForm.funcTitle" placeholder="请输入函数标题" />
					</el-form-item>
				</el-col>
			</el-row>

			<el-divider content-position="left">功能欢迎语（示例）</el-divider>
			<code-editor id="funcCode" v-model="propertyForm.welcomeMsg" theme="nord" height="400px" />
		</el-form>
	</div>
</template>
<script setup lang="ts">
import { rule } from '/@/utils/validate';
import { validateExist } from '/@/api/knowledge/aiFunc';
import { isEdit } from '/@/views/knowledge/aiFunc/workflow/design/utils';
import { useMessage } from '/@/hooks/message';
import CodeEditor from '/@/views/knowledge/aiFlow/components/CodeEditor.vue';

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
	funcName: '',
	funcTitle: '',
	welcomeMsg: '',
});
let rules = reactive({
	funcName: [
		{ required: true, message: '名称不能为空' },
		{
			validator: (rule: any, value: any, callback: any) => {
				validateExist(rule, value, callback, isEdit());
			},
		},
		{ validator: rule.validatorLowercase, trigger: 'blur' },
		{ validator: rule.overLength, trigger: 'blur' },
	],
	funcTitle: [
		{ required: true, message: '标题不能为空' },
		{ validator: rule.chinese, trigger: 'blur' },
		{ validator: rule.overLength, trigger: 'blur' },
		{
			validator: (rule: any, value: any, callback: any) => {
				validateExist(rule, value, callback, isEdit());
			},
		},
	],
});
let propertyFormRef = ref(null);

//确定
const confirmFunc = () => {
	propertyFormRef.value.validate((valid) => {
		if (valid) {
			props.lf.setProperties(props.nodeData.id, {
				funcName: propertyForm.funcName,
				funcTitle: propertyForm.funcTitle,
				welcomeMsg: propertyForm.welcomeMsg,
				frontend_status: '1',
			});
			useMessage().success('节点信息保存成功');
			emit('closed');
		}
	});
};

//取消
const cancelFunc = () => {
	emit('closed');
};

onMounted(() => {
	propertyForm.funcName = props.nodeData.properties.funcName;
	propertyForm.funcTitle = props.nodeData.properties.funcTitle;
	propertyForm.welcomeMsg = props.nodeData.properties.welcomeMsg;
});

defineExpose({
	confirmFunc,
});
</script>
<style scoped></style>
