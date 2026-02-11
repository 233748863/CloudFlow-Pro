<template>
	<div class="zoom-control">
		<el-button-group>
			<el-button @click="handleZoomIn" icon="zoom-in" size="small"></el-button>
			<el-button @click="handleZoomOut" icon="zoom-out" size="small"></el-button>
			<el-button @click="handleResetZoom" icon="refresh" size="small"></el-button>
			<el-button @click="handleArrangeNodes" icon="sort" size="small" title="一键整理"></el-button>
		</el-button-group>
		<span class="zoom-text">{{ Math.round(zoom * 100) }}%</span>
	</div>
</template>

<script>
export default {
	name: 'ZoomControl',
	inject: ['parent'], // 注入父组件引用
	props: {
		zoom: {
			type: Number,
			default: 1,
		},
		minZoom: {
			type: Number,
			default: 0.1,
		},
		maxZoom: {
			type: Number,
			default: 3,
		},
		zoomStep: {
			type: Number,
			default: 0.1,
		},
		position: {
			type: Object,
			default: () => ({ x: 0, y: 0 }),
		},
	},
	emits: ['update:zoom', 'updatePosition'],
	mounted() {
		window.addEventListener('wheel', this.handleMouseWheel, { passive: false });
	},
	beforeUnmount() {
		window.removeEventListener('wheel', this.handleMouseWheel, { passive: false });
	},
	methods: {
		handleMouseWheel(event) {
			event.preventDefault();
			if (event.deltaY < 0) {
				this.handleZoomIn();
			} else {
				this.handleZoomOut();
			}
		},
		// 放大
		handleZoomIn() {
			const newZoom = Math.min(this.maxZoom, this.zoom + this.zoomStep);
			this.$emit('update:zoom', newZoom);
		},

		// 缩小
		handleZoomOut() {
			const newZoom = Math.max(this.minZoom, this.zoom - this.zoomStep);
			this.$emit('update:zoom', newZoom);
		},

		// 重置缩放
		handleResetZoom() {
			this.$emit('update:zoom', 1);
			this.$emit('updatePosition', { x: 0, y: 0 });
		},

		/**
		 * 一键整理节点
		 * 按照工作流程图从左到右、从上到下的布局方式排列节点
		 */
		handleArrangeNodes() {
			if (!this.parent?.nodes?.length) return;

			const HORIZONTAL_GAP = 300; // 节点之间的水平间距
			const VERTICAL_GAP = 250; // 节点之间的垂直间距
			const START_X = 200; // 起始X坐标
			const START_Y = 300; // 起始Y坐标
			const visited = new Set(); // 记录已访问的节点
			const levels = new Map(); // 记录每个节点的层级
			const positions = new Map(); // 记录节点位置

			// 1. 找到所有起始节点（入度为0的节点）
			const startNodes = this.parent.nodes.filter((node) => !this.parent.connections.some((conn) => conn.targetId === node.id));

			// 2. 使用 BFS 计算每个节点的层级
			const queue = startNodes.map((node) => ({ node, level: 0 }));
			while (queue.length > 0) {
				const { node, level } = queue.shift();
				if (visited.has(node.id)) continue;

				visited.add(node.id);
				if (!levels.has(level)) {
					levels.set(level, []);
				}
				levels.get(level).push(node);

				// 获取当前节点的所有后继节点
				const nextNodes = this.parent.connections
					.filter((conn) => conn.sourceId === node.id)
					.map((conn) => this.parent.nodes.find((n) => n.id === conn.targetId))
					.filter(Boolean);

				// 将后继节点加入队列，层级+1
				nextNodes.forEach((nextNode) => {
					if (!visited.has(nextNode.id)) {
						queue.push({ node: nextNode, level: level + 1 });
					}
				});
			}

			// 3. 计算每个节点的新位置
			let maxNodesInLevel = 0;
			levels.forEach((nodes) => {
				maxNodesInLevel = Math.max(maxNodesInLevel, nodes.length);
			});

			// 4. 为每个层级的节点分配位置
			levels.forEach((nodes, level) => {
				const levelWidth = HORIZONTAL_GAP;
				const levelStartY = START_Y + (maxNodesInLevel * VERTICAL_GAP - nodes.length * VERTICAL_GAP) / 2;

				nodes.forEach((node, index) => {
					const x = START_X + level * levelWidth;
					const y = levelStartY + index * VERTICAL_GAP;
					positions.set(node.id, { x, y });
				});
			});

			// 5. 使用动画更新节点位置
			const duration = 500; // 动画持续时间（毫秒）
			const startTime = performance.now();
			const startPositions = new Map(this.parent.nodes.map((node) => [node.id, { x: node.x, y: node.y }]));

			const animate = (currentTime) => {
				const elapsed = currentTime - startTime;
				const progress = Math.min(elapsed / duration, 1);

				// 使用缓动函数使动画更自然
				const easeProgress = this.easeInOutCubic(progress);

				// 更新所有节点的位置
				this.parent.nodes.forEach((node) => {
					if (positions.has(node.id)) {
						const startPos = startPositions.get(node.id);
						const targetPos = positions.get(node.id);

						node.x = startPos.x + (targetPos.x - startPos.x) * easeProgress;
						node.y = startPos.y + (targetPos.y - startPos.y) * easeProgress;
					}
				});

				// 继续动画或结束
				if (progress < 1) {
					requestAnimationFrame(animate);
				} else {
					// 动画结束后重新计算连线
					this.parent.jsPlumbInstance?.repaintEverything();

					// 等待连线重绘完成后再居中显示
					setTimeout(() => {
						this.calculateFitZoom();
					}, 100);
				}
			};

			requestAnimationFrame(animate);
		},

		/**
		 * 缓动函数
		 * @param {number} t - 进度值 (0-1)
		 * @returns {number} 缓动后的进度值
		 */
		easeInOutCubic(t) {
			return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
		},

		/**
		 * 计算合适的缩放比例，使所有节点都在可视区域内
		 */
		calculateFitZoom() {
			if (!this.parent?.nodes?.length) return 1;

			// 获取工作区容器
			const container = document.querySelector('.workflow-container');
			if (!container) return 1;

			// 计算节点的边界
			let minX = Infinity;
			let minY = Infinity;
			let maxX = -Infinity;
			let maxY = -Infinity;

			this.parent.nodes.forEach((node) => {
				minX = Math.min(minX, node.x);
				minY = Math.min(minY, node.y);
				maxX = Math.max(maxX, node.x + 200); // 假设节点宽度为 200
				maxY = Math.max(maxY, node.y + 100); // 假设节点高度为 100
			});

			// 添加边距
			const PADDING = 100; // 增加边距，让画面更加宽松
			minX -= PADDING;
			minY -= PADDING;
			maxX += PADDING;
			maxY += PADDING;

			// 计算内容和容器的宽高比
			const contentWidth = maxX - minX;
			const contentHeight = maxY - minY;
			const containerWidth = container.clientWidth;
			const containerHeight = container.clientHeight;

			// 计算合适的缩放比例，确保完整显示
			const scaleX = containerWidth / contentWidth;
			const scaleY = containerHeight / contentHeight;
			const scale = Math.min(scaleX, scaleY, 1); // 不超过 1 倍

			// 计算居中位置，考虑缩放因素
			const centerX = (maxX + minX) / 2;
			const centerY = (maxY + minY) / 2;

			// 计算平移位置，使内容在容器中居中
			const translateX = containerWidth / 2 - centerX * scale;
			const translateY = containerHeight / 2 - centerY * scale;

			// 使用动画平滑过渡到新的位置和缩放
			const duration = 500;
			const startTime = performance.now();
			const startZoom = this.zoom;
			const startPos = { ...this.position };
			const targetPos = {
				x: translateX / scale,
				y: translateY / scale,
			};

			const animateView = (currentTime) => {
				const elapsed = currentTime - startTime;
				const progress = Math.min(elapsed / duration, 1);
				const easeProgress = this.easeInOutCubic(progress);

				// 更新缩放和位置
				const currentZoom = startZoom + (scale - startZoom) * easeProgress;
				const currentX = startPos.x + (targetPos.x - startPos.x) * easeProgress;
				const currentY = startPos.y + (targetPos.y - startPos.y) * easeProgress;

				this.$emit('update:zoom', currentZoom);
				this.$emit('updatePosition', { x: currentX, y: currentY });

				if (progress < 1) {
					requestAnimationFrame(animateView);
				}
			};

			requestAnimationFrame(animateView);
			return scale;
		},
	},
};
</script>

<style lang="scss" scoped>
.zoom-control {
	position: absolute;
	left: 20px;
	bottom: 20px;
	display: flex;
	align-items: center;
	gap: 8px;
	z-index: 100;
	padding: 4px;
	background: #fff;
	border-radius: 4px;
	box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);

	.el-button-group {
		.el-button {
			padding: 6px 8px;
			border: 1px solid #e4e7ed;
			background: transparent;

			&:hover {
				background-color: #f5f7fa;
				color: #409eff;
			}

			&:first-child {
				border-radius: 4px 0 0 4px;
			}

			&:last-child {
				border-radius: 0 4px 4px 0;
			}

			// 移除按钮文字
			span:last-child {
				display: none;
			}

			// 添加按钮提示效果
			&[title] {
				position: relative;

				&:hover::after {
					content: attr(title);
					position: absolute;
					bottom: 100%;
					left: 50%;
					transform: translateX(-50%);
					padding: 4px 8px;
					background: rgba(0, 0, 0, 0.8);
					color: white;
					font-size: 12px;
					border-radius: 4px;
					white-space: nowrap;
					margin-bottom: 6px;
				}
			}
		}
	}

	.zoom-text {
		color: #606266;
		font-size: 12px;
		min-width: 42px;
		text-align: center;
	}
}
</style>
