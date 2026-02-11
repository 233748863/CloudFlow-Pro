<template>
	<div>
		<code-editor id="funcDesc" v-model="propertyForm.funcDesc" theme="nord" height="200px" />

		<el-divider content-position="left">逻辑参数(可选)</el-divider>

		<div class="relative">
			<code-editor id="funcCode" v-model="propertyForm.funcDescCode" theme="nord" height="400px" />
		</div>
	</div>
</template>
<script setup lang="ts">
import { useMessage } from '/@/hooks/message';
import { checkScript } from '/@/api/knowledge/aiFunc';

import CodeEditor from '/@/views/knowledge/aiFlow/components/CodeEditor.vue';
import { Session } from '/@/utils/storage';

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
	funcDesc: '',
	funcDescCode: '',
});

//确定
const confirmFunc = async () => {
	if (propertyForm.funcDesc) {
		const result = await checkFuncDescCode();
		if (!result) {
			return;
		}

		props.lf.setProperties(props.nodeData.id, {
			funcDesc: propertyForm.funcDesc,
			funcDescCode: propertyForm.funcDescCode,
			frontend_status: '1', //0配置错误，1配置正常
		});

		useMessage().success('节点信息保存成功');
		emit('closed');
	} else {
		useMessage().error('功能描述不能为空');
	}
};

const checkFuncDescCode = async () => {
	if (propertyForm.funcDescCode) {
		const res = await checkScript({ script: propertyForm.funcDescCode.toString() });
		if (!res.ok) {
			useMessage().error(res.msg);
			return false;
		}
	}
	return true;
};

/**
 * 从会话存储中获取访问令牌
 * @returns {string} 访问令牌
 */
const token = computed(() => {
	return Session.getToken();
});
/**
 * 从会话存储中获取访问租户
 * @returns {string} 租户
 */
const tenant = computed(() => {
	return Session.getTenant();
});

onMounted(() => {
	propertyForm.funcDesc = props.nodeData.properties.funcDesc;
	propertyForm.funcDescCode = props.nodeData.properties.funcDescCode;
});

defineExpose({
	confirmFunc,
});
</script>
<style scoped></style>
