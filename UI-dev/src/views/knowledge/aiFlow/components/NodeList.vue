<!-- NodeList.vue -->
<template>
	<div class="execution-progress">
		<div v-for="node in nodes" :key="node.id" @click.stop="node.expanded = !node.expanded">
			<div class="node-execution" :class="getNodeStatus(node)">
				<div class="node-info">
					<svg-icon :size="24" :class="['node-icon', 'node-icon--' + node.type]" :name="`local-${node.type}`" />
					<span class="node-name">{{ node.name }}</span>
					<div class="node-time">
						<span>{{ formatDuration(node.duration) }}</span>
						<span v-if="node.tokens"> · {{ node.tokens }} tokens</span>
					</div>
				</div>

				<!-- 执行状态图标 -->
				<div class="status-icon">
					<el-icon :class="getStatusIconClass(node)">
						<component :is="getStatusIcon(node)" />
					</el-icon>
				</div>
			</div>
			<div class="trace-info" v-if="node.expanded">
				<!-- 添加输入输出展示 -->
				<div class="io-container">
					<!-- 输入数据 -->
					<div class="io-section" v-if="node.input">
						<div class="io-header" @click.stop="toggleIO(node.id, 'input')">
							<el-icon :class="{ 'is-rotate': isIOExpanded(node.id, 'input') }">
								<ArrowRight />
							</el-icon>
							<span>输入</span>
						</div>
						<div class="io-content" v-show="isIOExpanded(node.id, 'input')">
							<pre>{{ formatJSON(node.input) }}</pre>
						</div>
					</div>

					<!-- 输出数据 -->
					<div class="io-section">
						<div class="io-header" @click.stop="toggleIO(node.id, 'output')">
							<el-icon :class="{ 'is-rotate': isIOExpanded(node.id, 'output') }">
								<ArrowRight />
							</el-icon>
							<span>输出</span>
						</div>
						<div class="io-content" v-show="isIOExpanded(node.id, 'output')">
							<pre>{{ node.error || formatJSON(node.output) }}</pre>
						</div>
					</div>
				</div>
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { Close, Loading, Check, CircleClose, ArrowRight } from '@element-plus/icons-vue';

// 定义节点接口
interface Node {
	id: string | number;
	name: string;
	type: string;
	status?: 'running' | 'success' | 'error' | 'skipped' | 'pending';
	duration?: number;
	tokens?: number;
	error?: string;
	input?: any;
	output?: any;
	expanded?: boolean;
}

// 定义IO展开状态接口
interface ExpandedIO {
	[key: string]: {
		[key: string]: boolean;
	};
}

// 定义组件属性
const props = defineProps({
	// 节点数据列表
	nodes: {
		type: Array as () => Node[],
		required: true,
		default: () => [],
	},
});

// 定义事件
const emit = defineEmits(['end']);

// 存储输入输出展开状态
const expandedIO = ref<ExpandedIO>({});

// 监听节点变化
watch(
	() => props.nodes,
	(newNodes) => {
		const lastNode = newNodes[newNodes.length - 1];
		if (lastNode && (lastNode.status === 'success' || lastNode.status === 'error')) {
			emit('end', lastNode.status);
		}
	},
	{ deep: true }
);

// 获取节点状态样式
const getNodeStatus = (node: Node) => {
	return {
		running: node.status === 'running',
		success: node.status === 'success',
		error: node.status === 'error',
		skipped: node.status === 'skipped',
		pending: !node.status,
	};
};

// 格式化持续时间
const formatDuration = (duration?: number) => {
	if (!duration) return '0ms';
	if (duration < 1000) return `${duration}ms`;
	return `${(duration / 1000).toFixed(3)}s`;
};

// 检查输入输出是否展开
const isIOExpanded = (nodeId: string | number, type: string) => {
	if (!expandedIO.value[nodeId]) {
		return true;
	}
	return expandedIO.value[nodeId][type] !== false;
};

// 切换输入输出的展开状态
const toggleIO = (nodeId: string | number, type: string) => {
	if (!expandedIO.value[nodeId]) {
		expandedIO.value[nodeId] = {};
	}
	const currentState = expandedIO.value[nodeId][type] !== false;
	expandedIO.value[nodeId][type] = !currentState;
};

// 格式化 JSON 数据
const formatJSON = (data: any) => {
	try {
		return JSON.stringify(data, null, 2);
	} catch (e) {
		return data;
	}
};

// 获取状态图标组件
const getStatusIcon = (node: Node) => {
	const iconMap = {
		running: Loading,
		success: Check,
		error: CircleClose,
	};
	return iconMap[node.status as keyof typeof iconMap] || null;
};

// 获取状态图标的类名
const getStatusIconClass = (node: Node) => {
	return {
		'is-loading': node.status === 'running',
	};
};
</script>

<style scoped lang="scss">
@use '../styles/flow.scss';
</style>
