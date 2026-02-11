<template>
	<div>
		<div role="alert" class="shadow-lg alert">
			<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" class="w-6 h-6 stroke-info shrink-0">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
			</svg>
			<div>
				<div class="text-xs">大模型带参返回后，进行业务处理的逻辑，语法参考 magic-script</div>
			</div>
		</div>
		<code-editor id="funcResultCode" v-model="propertyForm.funcResultCode" theme="nord" height="600px" />
	</div>
</template>
<script setup lang="ts">
import CodeEditor from '/@/views/knowledge/aiFlow/components/CodeEditor.vue';
import { useMessage } from '/@/hooks/message';

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
	funcResultCode: '',
});

//确定
const confirmFunc = () => {
	if (propertyForm.funcResultCode) {
		props.lf.setProperties(props.nodeData.id, {
			funcResultCode: propertyForm.funcResultCode,
			frontend_status: '1', //0配置错误，1配置正常
		});
		useMessage().success('节点信息保存成功');
		emit('closed');
	} else {
		useMessage().error('处理逻辑不能为空');
	}
};

onMounted(() => {
	propertyForm.funcResultCode = props.nodeData.properties.funcResultCode;
});

defineExpose({
	confirmFunc,
});
</script>
<style scoped></style>
