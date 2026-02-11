<template>
	<div
		:id="node.id"
		:ref="node.id"
		class="workflow-node"
		:class="[
			node.type,
			{
				'node-selected': isSelected,
			},
		]"
		:style="nodeStyle"
		@mouseenter="$emit('node-mouseenter', node)"
		@mouseleave="$emit('node-mouseleave', node)"
		@mousedown="handleMouseDown"
		@mouseover="handleMouseOver"
		@click="handleNodeClick"
		@contextmenu="handleContextMenu"
	>
		<!-- 右上角菜单按钮 -->
		<div class="more-btn" @click.stop="$emit('showContextMenu', $event, node)">
			<i class="more-icon">⋮</i>
		</div>
		<template v-if="node.canBeTarget">
			<!-- 左侧添加按钮 -->
			<div :id="`${node.id}-input`" class="node-port node-port-input add-btn left-btn" @click.stop="$emit('showMenu', $event, node, 'left')">+</div>
		</template>

		<div class="node-content">
			<div class="node-header">
				<svg-icon :size="24" :class="['node-icon', 'node-icon--' + node.type]" :name="`local-${node.type}`" />
				<div class="node-title">{{ node.title || node.name }}</div>
			</div>
			<!-- 节点内容 -->
			<component :is="nodeComponent" :node="node" />
		</div>
		<template v-if="node.canBeSource">
			<!-- 右侧添加按钮 -->
			<div
				v-for="(port, index) in outputPorts"
				:key="index"
				:id="`${node.id}-output-${index}`"
				class="node-port node-port-output add-btn right-btn"
				:style="getStyle(index, outputPorts.length)"
				:data-port-name="port.name"
				@click.stop="$emit('showMenu', $event, node, 'right', index)"
			>
				+
			</div>
		</template>
	</div>
</template>

<script>
// 使用 import.meta.glob 动态导入所有节点组件
const modules = import.meta.glob('./nodes/*.vue', { eager: true });

export default {
	name: 'WorkflowNode',
	inject: ['parent'],
	props: {
		node: {
			type: Object,
			required: true,
		},
		isSelected: {
			type: Boolean,
			default: false,
		},
	},
	computed: {
		nodeStyle() {
			return {
				left: `${this.node.x}px`,
				top: `${this.node.y}px`,
			};
		},
		nodeComponent() {
			// 从文件名中提取组件类型
			const nodeName = `${this.node.type.charAt(0).toUpperCase()}${this.node.type.slice(1)}Node`;
			// 查找对应的面板组件
			const node = Object.values(modules).find((module) => module.default.name === nodeName);
			return node?.default;
		},
		// 添加输出端口计算属性
		outputPorts() {
			// 根据节点类型返回不同数量的端口
			// 根据节点类型返回对应的端口配置
			const portConfigs = {
				question: () => {
					const length = this.node.questionParams?.categories?.length || 1;
					return Array.from({ length }, (_, i) => ({ name: this.node.questionParams?.categories?.[i]?.name || `事件${i + 1}` }));
				},
				switch: () => {
					const length = this.node.switchParams?.cases?.length || 1;
					return Array.from({ length }, (_, i) => ({ name: this.node.switchParams?.cases?.[i]?.name || `事件${i + 1}` }));
				},
				default: () => [{ name: '' }],
			};

			// 使用节点类型获取对应的端口配置,如果没有则使用默认配置
			return (portConfigs[this.node.type] || portConfigs.default)();
		},
	},
	data() {
		return {
			isDragging: false,
			moreMenuVisible: false,
			menuPosition: { x: 0, y: 0 },
			moreMenuNode: null,
		};
	},
	methods: {
		handleMouseDown(event) {
			this.isDragging = false;
			this.parent.selectedNode = this.node;
		},

		handleMouseOver() {
			this.$nextTick(() => {
				this.isDragging = true;
			});
		},
		handleNodeClick(event) {
			// 只有当不是拖动时才触发选择事件
			if (!this.isDragging) {
				this.$emit('select', this.node, event);
			}
		},

		// 获取端口样式
		getStyle(index, len) {
			// 如果只有一个端口,居中显示
			if (len == 1) {
				return {
					top: `50%`,
					transform: 'translateY(-50%)',
				};
			}

			// 计算多个端口的间距
			const spacing = 100 / (len - 1);
			return {
				top: `${spacing * index}%`,
				transform: 'translateY(-50%)',
			};
		},

		// 添加右键菜单处理方法
		handleContextMenu(event) {
			// 阻止默认右键菜单
			event.preventDefault();
			// 触发父组件的showMenu事件
			this.$emit('showContextMenu', event, this.node);
		},
	},
};
</script>

<style lang="scss" scoped>
.workflow-node {
	position: absolute;
	width: 250px;
	min-height: 40px;
	border-radius: 8px;
	cursor: move;
	user-select: none;
	transition: all 0.3s ease;
	background-color: #fff;
}
.node-content {
	width: 100%;
}
.node-header {
	padding: 8px 10px;
	display: flex;
	align-items: center;
}
.node-title {
	font-weight: bold;
	font-size: 12px;
	color: #333;
}

.add-btn {
	// display: none;
	padding: 0;
	width: 16px;
	height: 16px;
	background: #3b82f6;
	color: #fff;
	border-radius: 50%;
	display: flex;
	align-items: center;
	justify-content: center;
	cursor: pointer;
	position: absolute;
	text-align: center;
	line-height: 100%;
	font-size: 14px;
	transition: all 0.2s ease;

	&:hover {
		transform: scale(1.1);
		background: #2563eb;
	}

	&::after {
		content: attr(data-port-name);
		position: absolute;
		right: -60px;
		font-size: 12px;
		color: #666;
		opacity: 0;
		transition: opacity 0.2s ease;
	}

	&:hover::after {
		opacity: 1;
	}
}

.left-btn {
	left: -8px;
	top: 50%;
	transform: translateY(-50%);
	display: none;
}

.right-btn {
	right: -8px;
	display: none;
	z-index: 2;
}

.workflow-node:hover {
	box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
	.left-btn,
	.right-btn {
		display: block;
	}
	.more-btn {
		display: flex;
	}
}

.node-selected {
	border: 2px solid #3b82f6;
}

/* 添加更多按钮的样式 */
.more-btn {
	padding: 2px 5px;
	display: none;
	position: absolute;
	right: 5px;
	top: -5px;
	padding: 3px 5px;
	align-items: center;
	justify-content: center;
	cursor: pointer;
	border-radius: 4px;
	z-index: 1;
	transform: rotate(90deg);
}

.more-icon {
	font-size: 16px;
	font-style: normal;
	color: #666;
	display: inline-block;
}
</style>
