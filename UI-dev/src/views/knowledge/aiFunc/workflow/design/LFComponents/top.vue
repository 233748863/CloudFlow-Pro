<template>
	<div>
		<div class="ml-4">
			<div class="flex justify-end">
				<el-button type="primary" plain @click="viewJsonFunc">预览</el-button>
				<el-button v-if="flowDetail.status != '2'" type="primary" :loading="saveLoading" @click="saveFunc">发布 </el-button>
			</div>
		</div>
		<!-- 查看JSON -->
		<viewJson v-if="showViewJson" :graphData="graphData" @closed="showViewJson = false"></viewJson>
	</div>
</template>

<script setup lang="ts">
import viewJson from './view-json.vue';
import { addObj } from '/@/api/knowledge/aiFunc';
import { useMessage } from '/@/hooks/message';

const props = defineProps({
	lf: Object,
	//标题
	title: {
		type: String,
		default: '',
	},
	//详情
	flowDetail: {
		type: Object,
		default: () => {
			return {};
		},
	},
});

let saveLoading = ref(false);
let graphData = reactive({});
let showViewJson = ref(false);
let debugDisabled = ref(false);

//保存
const router = useRouter();

const saveFunc = async () => {
	try {
		saveLoading.value = true;
		// 校验
		for (const node of props.lf.getGraphData().nodes) {
			if (node.type === 'endParallel') {
				continue;
			}
			if (node.properties?.frontend_status !== '1') {
				useMessage().error(`请完善【${node.text.value}】节点配置`);
				return;
			}
		}

		const { data } = await addObj({ flowJson: JSON.stringify(props.lf.getGraphData()), id: props.flowDetail.flowId });
		useMessage().success('保存成功');
		router.push({
			path: '/knowledge/aiFunc/workflow/index',
			query: { id: data.id },
		});
	} catch (err: any) {
		useMessage().error(err.msg);
	} finally {
		saveLoading.value = false;
	}
};

//查看JSON
const viewJsonFunc = () => {
	graphData = props.lf.getGraphData();
	showViewJson.value = true;
};

onMounted(() => {
	if (!props.flowDetail.flowJson) {
		debugDisabled.value = true;
	}
});
</script>
