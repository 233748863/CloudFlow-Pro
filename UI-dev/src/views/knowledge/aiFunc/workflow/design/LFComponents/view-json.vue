<template>
	<div>
		<el-dialog title="查看JSON" v-model="showViewJson" width="700px" top="15px" append-to-body @closed="closed">
			<div class="json-container">
				<json-editor ref="jsonEditorRef" v-model="graphDataJson" codec />
				<div class="json-copy">
					<el-tooltip content="复制" placement="left">
						<el-icon @click="copyText(JSON.stringify(graphDataJson))"><CopyDocument /></el-icon>
					</el-tooltip>
				</div>
			</div>
		</el-dialog>
	</div>
</template>
<script setup lang="ts">
// @ts-ignore
import JsonEditor from '@axolo/json-editor-vue';
const { copyText } = commonFunction();
import { CopyDocument } from '@element-plus/icons-vue';
import { ref, onMounted, reactive } from 'vue';
import commonFunction from '/@/utils/commonFunction';

const props = defineProps({
	graphData: Object,
});
const emit = defineEmits();

let showViewJson = ref(true);
let graphDataJson = reactive({});

//弹窗关闭
const closed = () => {
	emit('closed', true);
};

onMounted(() => {
	graphDataJson = {
		flowName: '测试',
		flowId: '1',
		flowJson: props.graphData,
	};
});
</script>
<style scoped></style>
