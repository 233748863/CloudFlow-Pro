<template>
	<el-card class="h-full">
		<template #header>
			<div class="flex justify-between items-center h-8">
				<h1 class="flex text-xl font-bold">② 配置节点-{{ nodeData.text.value }}</h1>
				<div class="flex justify-end">
					<el-button type="primary" @click="propRef.confirmFunc()" v-if="nodeData.type !== 'endParallel'">暂存</el-button>
				</div>
			</div>
		</template>
		<div class="ml-2 mr-2">
			<startProperty
				ref="propRef"
				v-if="nodeData.type === 'start'"
				:title="title"
				:nodeData="nodeData"
				:lf="lf"
				:flowDetail="flowDetail"
				@closed="closed"
			/>

			<funcDescProperty
				ref="propRef"
				v-if="nodeData.type === 'funcDesc'"
				:title="title"
				:nodeData="nodeData"
				:lf="lf"
				:flowDetail="flowDetail"
				@closed="closed"
			/>

			<execProperty
				ref="propRef"
				v-if="nodeData.type === 'exec'"
				:title="title"
				:nodeData="nodeData"
				:lf="lf"
				:flowDetail="flowDetail"
				@closed="closed"
			></execProperty>

			<resultProperty
				ref="propRef"
				v-if="nodeData.type === 'result'"
				:title="title"
				:nodeData="nodeData"
				:lf="lf"
				:flowDetail="flowDetail"
				@closed="closed"
			></resultProperty>

			<!-- 连线 -->
			<myBezier v-if="nodeData.type === 'myBezier'" :title="title" :nodeData="nodeData" :lf="lf" :flowDetail="flowDetail" @closed="closed"></myBezier>
		</div>
	</el-card>
</template>
<script setup lang="ts">
import startProperty from '../registerNode/start/startProperty.vue';
import funcDescProperty from '/@/views/knowledge/aiFunc/workflow/design/registerNode/funcDesc/funcDescProperty.vue';
import execProperty from '/@/views/knowledge/aiFunc/workflow/design/registerNode/exec/execProperty.vue';
import resultProperty from '../registerNode/result/resultProperty.vue';
import myBezier from '../registerEdge/myBezier.vue';

const props = defineProps({
	//标题
	title: {
		type: String,
		default: '',
	},
	nodeData: Object,
	lf: Object,
	//详情
	flowDetail: {
		type: Object,
		default: () => {
			return {};
		},
	},
});
const propRef = ref();
const emit = defineEmits();

//弹窗关闭
const closed = (val: any) => {
	emit('closed', val);
};

onMounted(() => {});
</script>
<style></style>
