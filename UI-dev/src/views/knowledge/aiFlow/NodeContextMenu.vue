<template>
	<div v-if="visible" class="context-menu" :style="menuStyle">
		<div class="menu-item" v-for="item in nodeTypes" :key="item.type" @click="handleAddNode(item.type)">
			<svg-icon :size="24" :class="['menu-icon', 'node-icon', 'node-icon--' + item.type]" :name="`local-${item.type}`" />
			{{ item.name }}
		</div>
	</div>
</template>

<script>
import { nodeTypes } from './nodes/nodeTypes.ts';

export default {
	name: 'NodeContextMenu',
	props: {
		visible: {
			type: Boolean,
			default: false,
		},
		position: {
			type: Object,
			default: () => ({ x: 0, y: 0 }),
		},
		node: {
			type: Object,
			default: null,
		},
		addPosition: {
			type: String,
			default: '',
		},
	},
	computed: {
		menuStyle() {
			return {
				left: `${this.position.x}px`,
				top: `${this.position.y}px`,
			};
		},
		canAddNode() {
			return this.addPosition && this.node;
		},
		nodeTypes() {
			let types = nodeTypes.map((config) => ({
				type: config.type,
				name: config.name,
			}));

			if (this.addPosition === 'replace') {
				types = types.filter((node) => node.type !== 'start' && node.type !== this.node?.type);
			} else {
				types = types.filter((node) => node.type !== 'start');
			}

			return types;
		},
	},
	methods: {
		handleAddNode(type) {
			this.$emit('add', type);
			this.$emit('update:visible', false);
		},
		handleClickOutside(e) {
			if (!this.$el.contains(e.target)) {
				this.$emit('update:visible', false);
			}
		},
	},
	watch: {
		visible(val) {
			if (!val) {
				this.$emit('update:visible', false);
			}
		},
	},
	mounted() {
		// 点击外部关闭菜单
		document.addEventListener('click', this.handleClickOutside);
	},
	beforeUnmount() {
		document.removeEventListener('click', this.handleClickOutside);
	},
};
</script>

<style scoped>
.context-menu {
	opacity: 0.9;
	position: fixed;
	background: #ffffff;
	border-radius: 8px;
	box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08), 0 2px 4px rgba(0, 0, 0, 0.05);
	padding: 6px 0;
	min-width: 180px;
	z-index: 1000;
	border: 1px solid rgba(0, 0, 0, 0.06);
	animation: menuFadeIn 0.15s ease-out;
}

.menu-item {
	padding: 8px 16px;
	display: flex;
	align-items: center;
	cursor: pointer;
	transition: all 0.2s ease;
	color: rgb(71 84 103 / 1);
	font-size: 13px;
	white-space: nowrap;
}

.menu-item:hover {
	background-color: #f8fafc;
	transform: translateX(2px);
}

.menu-icon {
	padding: 3px;
	width: 12px;
	height: 12px;
}

.menu-divider {
	height: 1px;
	background-color: #e5e7eb;
	margin: 6px 0;
}

@keyframes menuFadeIn {
	from {
		opacity: 0;
		transform: scale(0.95);
	}
	to {
		opacity: 1;
		transform: scale(1);
	}
}
</style>
