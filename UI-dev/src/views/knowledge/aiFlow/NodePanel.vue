<template>
	<el-drawer v-model="drawerVisible" :title="node.name" :size="520" :show-close="false" direction="rtl" @close="$emit('close')">
		<template #header>
			<div class="px-5 py-4 w-full bg-white border-b border-gray-200">
				<div class="flex justify-between items-center mb-3">
					<div class="flex gap-2 items-center text-gray-800">
						<svg-icon :size="24" :class="['node-icon', 'node-icon--' + node.type]" :name="`local-${node.type}`" />
						<input class="text-base font-bold bg-transparent border-none outline-none w-30" v-model="node.name" />
						<small class="text-xs text-gray-500">{{ node.id }}</small>
					</div>
					<!-- 关闭按钮 -->
					<div class="p-2 rounded transition-colors cursor-pointer hover:bg-gray-100" @click="$emit('close')">
						<el-icon><Close /></el-icon>
					</div>
				</div>
				<!-- 描述区域 -->
				<div>
					<input
						v-model="node.description"
						class="w-full min-h-[30px] px-2 py-1 text-sm bg-gray-50 border border-gray-200 rounded outline-none transition-all hover:border-gray-300 hover:bg-white focus:border-blue-500 focus:bg-white focus:shadow-[0_0_0_2px_rgba(59,130,246,0.1)]"
						placeholder="添加描述..."
					/>
				</div>
			</div>
		</template>

		<div class="box-border flex flex-col h-full">
			<div class="overflow-y-auto flex-1 pb-4">
				<component :is="nodeConfig" :key="node.id" :node="node" />
			</div>

			<!-- 下一个节点显示区域 -->
			<div class="px-5 py-4 bg-white border-t border-gray-200" v-if="node.type !== 'end'">
				<div class="flex justify-between mb-2">
					<div class="mb-2 text-sm font-bold text-gray-700">下一个节点</div>
				</div>
				<div class="p-4 bg-gray-50 rounded-lg">
					<div class="relative" v-if="nextNodes.length">
						<div class="flex items-center relative min-h-[100px]">
							<!-- 当前节点 -->
							<div class="flex items-center gap-2 px-3 py-2 bg-gray-100 border border-gray-200 rounded min-w-[120px] h-10 relative mr-[80px]">
								<svg-icon :size="24" :class="['node-icon', 'node-icon--' + node.type]" :name="`local-${node.type}`" />
								<span class="text-sm text-gray-700 truncate">{{ node.name }}</span>
								<!-- 连接线 -->
								<div class="absolute top-1/2 right-[-80px] w-[80px] h-[2px] bg-gray-200"></div>
							</div>

							<!-- 分支连线和节点 -->
							<div class="flex relative flex-col flex-1 gap-8 pl-10 min-h-full">
								<!-- 垂直连接线 -->
								<div class="absolute left-0 top-5 h-[calc(100%-20px)] w-[2px] bg-gray-200"></div>

								<div v-for="branch in nextNodes" :key="branch.node?.id" class="relative flex items-center gap-4 min-h-[40px]">
									<!-- 水平连接线 -->
									<div class="absolute top-1/2 left-[-40px] w-[20px] h-[2px] bg-gray-200"></div>

									<!-- 分支节点 -->
									<template v-if="branch.node">
										<div class="flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 rounded min-w-[120px] h-10 ml-[-80px]">
											<svg-icon :size="24" :class="['node-icon', 'node-icon--' + branch.node.type]" :name="`local-${branch.node.type}`" />
											<span class="text-sm text-gray-700 truncate">{{ branch.node.name }}</span>
										</div>
										<el-button type="primary" size="small" link @click.stop="jumpToNextNode(branch.node)" class="flex gap-1 items-center">
											<el-icon><Right /></el-icon>
											跳转到节点
										</el-button>
									</template>
									<template v-else>
										<el-button type="primary" plain size="small" class="w-[180px] h-9 justify-center gap-1 border-dashed">
											<el-icon><Plus /></el-icon>
											选择下一个节点
										</el-button>
									</template>
								</div>
							</div>
						</div>
					</div>
					<div v-else class="py-5 text-center text-gray-500 bg-white rounded-lg border border-gray-200 border-dashed">暂无下一个节点</div>
				</div>
			</div>
		</div>
	</el-drawer>
</template>

<script>
import { Close, Right, Plus } from '@element-plus/icons-vue';
// 使用 import.meta.glob 自动导入所有面板组件
const modules = import.meta.glob('./panels/*.vue', { eager: true });

export default {
	name: 'NodePanel',
	components: {
		Close,
		Right,
		Plus,
	},
	inject: ['parent'],
	props: {
		visible: {
			type: Boolean,
			default: false,
		},
		node: {
			type: Object,
			required: true,
		},
	},
	data() {
		return {
			highlightedConnection: null,
		};
	},
	computed: {
		// 添加抽屉显示状态的计算属性
		drawerVisible: {
			get() {
				return this.visible;
			},
			set(value) {
				this.$emit('update:visible', value);
			},
		},
		nodeConfig() {
			// 从文件名中提取组件类型
			// 检查节点类型是否存在，并构建面板组件名称
			const panelName = this.node?.type ? `${this.node.type.charAt(0).toUpperCase()}${this.node.type.slice(1)}Panel` : '';
			// 查找对应的面板组件
			const panel = panelName ? Object.values(modules).find((module) => module.default.name === panelName) : {};
			return panel?.default;
		},
		// 获取下一个节点的逻辑
		nextNodes() {
			if (!this.parent?.connections || !this.node) {
				return [];
			}

			// 获取所有从当前节点出发的连接
			const nextConnections = this.parent.connections.filter((conn) => conn.sourceId === this.node.id);

			// 将连接转换为节点信息
			return nextConnections.map((conn) => {
				const targetNode = this.parent.nodes.find((node) => node.id === conn.targetId);
				return {
					node: targetNode,
					condition: conn.condition || '默认分支',
				};
			});
		},
	},
	methods: {
		jumpToNextNode(node) {
			if (!node) return;

			// 延迟执行以确保 DOM 已更新
			this.$nextTick(() => {
				// 获取工作流容器元素
				const workflowContainer = document.querySelector('.workflow-container');
				// 获取目标节点元素
				const nextNodeElement = workflowContainer?.querySelector(`#${node.id}`);

				if (nextNodeElement && workflowContainer) {
					// 计算目标节点相对于容器的位置
					const containerRect = workflowContainer.getBoundingClientRect();
					const nodeRect = nextNodeElement.getBoundingClientRect();

					// 计算滚动位置，使节点居中显示
					const scrollLeft = nodeRect.left - containerRect.left - (containerRect.width - nodeRect.width) / 2;
					const scrollTop = nodeRect.top - containerRect.top - (containerRect.height - nodeRect.height) / 2;
					// 平滑滚动到目标位置
					workflowContainer.scrollTo({
						left: workflowContainer.scrollLeft + scrollLeft,
						top: workflowContainer.scrollTop + scrollTop,
						behavior: 'smooth',
					});
				}
				// 选中节点
				this.parent.selectNode(node);
			});
		},
	},
};
</script>

<style scoped>
/* 保留节点图标样式，这部分可能需要单独处理 */
:deep(.highlight-connection) {
	stroke: var(--el-color-primary) !important;
	stroke-width: 2px !important;
	animation: connectionPulse 2s infinite;
}

@keyframes connectionPulse {
	0% {
		stroke-opacity: 1;
	}
	50% {
		stroke-opacity: 0.5;
	}
	100% {
		stroke-opacity: 1;
	}
}
</style>
