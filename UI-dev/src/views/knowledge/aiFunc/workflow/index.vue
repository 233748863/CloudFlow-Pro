<template>
	<div class="p-4">
		<div class="h-full">
			<!-- 顶部标题栏 -->
			<div class="flex justify-between items-center mb-4 bg-white rounded-lg shadow-sm">
				<div class="flex items-center h-[48px]">
					<div class="flex items-center px-4">
						<span class="font-medium text-gray-700">① 编排</span>
					</div>
				</div>
				<div class="flex items-center h-[48px] px-4">
					<span class="font-medium text-gray-700">② 配置节点-模型基础配置</span>
				</div>
				<div class="flex items-center h-[48px] px-4">
					<span class="font-medium text-gray-700">③ 调试</span>
					<div class="ml-auto">
						<top v-if="showTop" :lf="lf" :flowDetail="flowDetail" class="transition-all"></top>
					</div>
				</div>
			</div>

			<splitpanes class="overflow-hidden rounded-lg shadow-sm">
				<pane min-size="30">
					<!-- 编排区域 -->
					<el-card class="h-full border-0 !shadow-none">
						<div class="logic-flow-view">
							<div id="LF-view" ref="container" class="rounded-md"></div>
						</div>
					</el-card>
				</pane>
				<pane min-size="30">
					<!-- 属性面板 -->
					<PropertyDialog v-if="showAttribute" :nodeData="nodeData" :flowDetail="flowDetail" :lf="lf" class="h-full"></PropertyDialog>
				</pane>
				<pane min-size="30">
					<debug-dialog :funcName="funcName" :welcomeMsg="welcomeMsg" class="h-full" />
				</pane>
			</splitpanes>
		</div>
	</div>
</template>
<script setup lang="ts">
import LogicFlow from '@logicflow/core';
import { Menu, Snapshot, MiniMap } from '@logicflow/extension';
import '@logicflow/core/dist/style/index.css';
import '@logicflow/extension/lib/style/index.css';
import start from '/@/views/knowledge/aiFunc/workflow/design/registerNode/start/start';
import funcDesc from '/@/views/knowledge/aiFunc/workflow/design/registerNode/funcDesc/funcDesc';
import registerBezier from '/@/views/knowledge/aiFunc/workflow/design/registerEdge/registerBezier';
import result from '/@/views/knowledge/aiFunc/workflow/design/registerNode/result/result';
import exec from '/@/views/knowledge/aiFunc/workflow/design/registerNode/exec/exec';
import endParallel from '/@/views/knowledge/aiFunc/workflow/design/registerNode/endParallel/endParallel';
import variables from '/@/assets/styles/variables.module.scss';
import PropertyDialog from '/@/views/knowledge/aiFunc/workflow/design/PropertySetting/PropertyDialog.vue';
import top from '/@/views/knowledge/aiFunc/workflow/design/LFComponents/top.vue';
import { flowJsonOption, flowJsonThemeOption } from '/@/views/knowledge/aiFunc/workflow/workflow';
import { getObj } from '/@/api/knowledge/aiFunc';

const DebugDialog = defineAsyncComponent(() => import('./debug.vue'));

let lf = reactive<any>({});
let nodeData = ref(flowJsonOption.nodes[0]);
let showAttribute = ref(false);
let config = reactive({
	background: {
		backgroundColor: variables.dragPanelBgColor,
	},
	grid: {
		size: 10,
		visible: false,
	},
	keyboard: {
		enabled: false,
	},
	adjustEdge: false, //允许调整边
	adjustEdgeStartAndEnd: false, //是否允许拖动边的端点来调整连线
	edgeSelectedOutline: true, //鼠标 hover 的时候显示边的外框
	// edgeTextDraggable: true,
	hoverOutline: false,
	nodeTextEdit: false, //节点是否可编辑。false不可编辑
	edgeTextEdit: false, //边是否可编辑。false不可编辑
	autoExpand: false, //点拖动靠近画布边缘时是否自动扩充画布
	textEdit: false, //是否开启文本编辑
	snapline: false, //对齐线。false不开启
});
let flowDetail = reactive({});
let container = ref(null);
let showLf = ref(false);
let showTop = ref(false);

const $_initLf = () => {
	// 画布配置
	const myLf = new LogicFlow({
		...config,
		plugins: [Menu, MiniMap, Snapshot],
		//@ts-ignore
		container: container.value,
	});
	lf = myLf;
	showLf.value = true;
	// 设置主题
	lf.setTheme(flowJsonThemeOption);
	lf.setDefaultEdgeType('myBezier'); //线类型，贝塞尔曲线
	$_registerNode();
};

// 自定义
const flowJson = ref(flowJsonOption);
const $_registerNode = () => {
	start(lf);
	funcDesc(lf);
	exec(lf);
	endParallel(lf);
	result(lf);
	lf.register(registerBezier);
	$_render();
};

const $_render = () => {
	showTop.value = true;
	lf.render(flowJson.value); //回显
	$_LfEvent();
};

const $_LfEvent = () => {
	//来自节点的事件中心发出的事件
	lf.on('node:click', ({ data }: any): void => {
		nodeData.value = data;
		if (['start', 'funcDesc', 'exec', 'result'].includes(data.type)) {
			showAttribute.value = true;
		}
	});
};

const route = useRoute();
const funcName = ref();
const welcomeMsg = ref();
onMounted(async () => {
	if (route.query?.id) {
		const res = await getObj({ id: route.query.id });
		const flow = res.data[0];
		flowJson.value = JSON.parse(flow.flowJson);
		flowDetail = {
			flowName: flow.funcName,
			flowId: flow.id,
			flowJson: flowJson.value,
		};

		funcName.value = flow.funcName;
		welcomeMsg.value = flow.welcomeMsg;
		nodeData.value = flowJson.value.nodes[0];
	}
	await $_initLf();
	showAttribute.value = true;
});
</script>
<style lang="scss">
.logic-flow-view {
	height: 85vh;
	position: relative;
}

#LF-view {
	width: 100%;
	height: 100%;
	outline: none;
	border-radius: 0.375rem;
}

// 现代化样式优化
.splitpanes {
	&__pane {
		transition: all 0.2s ease;
	}

	&__splitter {
		background-color: #f5f5f5;
		position: relative;

		&:hover {
			background-color: #e0e7ff;
		}

		&:after {
			content: '';
			position: absolute;
			top: 50%;
			left: 50%;
			transform: translate(-50%, -50%);
			width: 24px;
			height: 2px;
			background-color: #d1d5db;
			border-radius: 2px;
		}
	}
}

// 节点样式优化
.node-title {
	height: 40px;
	width: 100%;
	background: #fff;
	border: 1px solid #e6f7ff;
	box-sizing: border-box;
	padding: 8px;
	border-radius: 8px;
	cursor: pointer;
	transition: all 0.2s ease;
	box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);

	&:hover {
		box-shadow: 0 3px 6px rgba(0, 0, 0, 0.1);
		transform: translateY(-1px);
	}
}

.node-icon {
	width: 26px;
	height: 100%;
	display: flex;
	justify-content: center;
	align-items: center;
	font-size: 16px;
}

// 小地图样式优化
.lf-mini-map {
	border: none !important;
	box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
	border-radius: 8px;
	overflow: hidden;
}

.lf-mini-map-header {
	border: none !important;
	font-size: 12px;
	height: 28px !important;
	line-height: 28px !important;
	background-color: #f9fafb !important;
	background-image: none !important;
	color: #4b5563;
	font-weight: 500;
}

.lf-mini-map-close {
	top: 4px !important;
	opacity: 0.6;
	transition: opacity 0.2s;

	&:hover {
		opacity: 1;
	}
}

// 适应节点图标
.lf-node-text-ellipsis-content {
	padding: 0 10px 0 34px !important;
}

// 动画效果
@keyframes lf_animate_dash {
	to {
		stroke-dashoffset: 0;
	}
}
</style>
