<template>
	<div class="workflow-designer">
		<div class="workflow-main">
			<!-- 执行面板 -->
			<template v-if="showExecutionPanel">
				<ExecutionPanel
					ref="executionPanel"
					v-model="showExecutionPanel"
					:execution-nodes="executionNodes"
					:final-result="executionResult"
					:execution-time="executionTime"
					:total-tokens="totalTokens"
					:start-params="startNodeParams"
					@run="runWorkflow"
					@close="showExecutionPanel = false"
				/>
			</template>

			<!-- 工具栏 -->
			<Toolbar @run="handleRunClick" />

			<!-- 缩放控制 -->
			<ZoomControl ref="zoomControl" v-model:zoom="zoom" v-model:position="position" :min-zoom="minZoom" :max-zoom="maxZoom" :zoom-step="zoomStep" />

			<!-- 缩略图组件 -->
			<MiniMap :nodes="nodes" :connections="connections" :zoom="zoom" v-model:position="position" :width="170" :height="150" />

			<!-- 工作区容器，添加右键菜单事件 -->
			<div
				class="workflow-container"
				id="workflow-container"
				@mousedown="startDrag"
				@mousemove="onDrag"
				@mouseup="stopDrag"
				@mouseleave="stopDrag"
				@wheel="handleWheel"
				@contextmenu="handleCanvasContextMenu"
			>
				<div
					class="workflow-canvas"
					ref="canvas"
					:style="{
						transform: `scale(${zoom}) translate(${position.x}px, ${position.y}px)`,
						width: `${safeCanvasWidth}px`,
						height: `${safeCanvasHeight}px`,
					}"
					@contextmenu="handleCanvasContextMenu"
				>
					<!-- 节点项 -->
					<NodeItem
						v-for="node in nodes"
						:key="node.id"
						:node="node"
						:is-selected="selectedNode && selectedNode.id === node.id"
						@select="selectNode"
						@dblclick="handleNodeDblClick(node, $event)"
						@node-mouseenter="mouseenter"
						@node-mouseleave="mouseleave"
						@showContextMenu="showContextMenu"
						@showMenu="showMenu"
					/>
				</div>
			</div>

			<!-- 节点右键菜单 -->
			<nodeContextMenu
				v-model:visible="contextMenuVisible"
				:position="contextMenuPosition"
				:node="contextMenuNode"
				:add-position="contextMenuAddPosition"
				:port-index="contextMenuPortIndex"
				@add="addNode"
			/>

			<!-- 节点面板 -->
			<nodePanel v-model:visible="showPanel" :node="selectedNode" @close="handleClosePanel" />

			<!-- 更多菜单 -->
			<NodeMoreMenu v-model:visible="moreMenuVisible" :position="menuPosition" :node="moreMenuNode" />

			<!-- 连线操作按钮组 -->
			<div
				v-show="connectionActionVisible"
				class="connection-action"
				:style="{
					left: `${connectionActionPosition.x}px`,
					top: `${connectionActionPosition.y}px`,
				}"
				@mouseenter="connectionActionVisible = true"
				@mouseleave="connectionActionVisible = false"
			>
				<div class="connection-action-buttons">
					<el-button type="primary" circle icon="el-icon-plus" class="action-btn add-node-btn" @click.stop="handleConnectionAction"> </el-button>
					<el-button type="danger" circle icon="el-icon-delete" class="action-btn delete-node-btn" @click.stop="handleDeleteConnection"> </el-button>
				</div>
			</div>

			<!-- 画布右键菜单 -->
			<CanvasContextMenu
				v-model:visible="canvasContextMenuVisible"
				:position="canvasContextMenuPosition"
				@add="handleAddNode"
				@import="handleImportDSL"
				@export="handleExportDSL"
			/>
		</div>
	</div>
</template>

<script>
import { jsPlumb } from 'jsplumb';
import NodeItem from './NodeItem.vue';
import NodePanel from './NodePanel.vue';
import { getNodeConfig } from './nodes/nodeTypes.ts';
import NodeContextMenu from './NodeContextMenu.vue';
import Toolbar from './Toolbar.vue';
import NodeMoreMenu from './NodeMoreMenu.vue';
import ZoomControl from './ZoomControl.vue';
import ExecutionPanel from './ExecutionPanel.vue';
import ChatPanel from './ChatPanel.vue';
import { ArrowLeft } from '@element-plus/icons-vue';
import NodeCommon from './mixins/Node';
import MiniMap from './MiniMap.vue';
import CanvasContextMenu from './CanvasContextMenu.vue';
import { putObj, getObj } from '/@/api/knowledge/aiFlow';
import { NextLoading } from '/@/utils/loading';

export default {
	name: 'WorkflowDesigner',
	mixins: [NodeCommon],
	components: {
		NodeItem,
		NodePanel,
		NodeContextMenu,
		Toolbar,
		NodeMoreMenu,
		ExecutionPanel,
		ChatPanel,
		ZoomControl,
		ArrowLeft,
		MiniMap,
		CanvasContextMenu,
	},
	provide() {
		return {
			parent: this,
			nodes: this.nodes,
			connections: this.connections,
		};
	},
	data() {
		return {
			jsPlumbInstance: null,
			dsl: {},
			selectedNode: {},
			showPanel: false,
			position: { x: 0, y: 0 }, // 画布位置
			contextMenuVisible: false,
			contextMenuPosition: { x: 0, y: 0 },
			contextMenuNode: null,
			contextMenuAddPosition: '',
			contextMenuPortIndex: 0,
			showPreview: false, // 预览面板显示状态
			moreMenuVisible: false,
			menuPosition: { x: 0, y: 0 },
			moreMenuNode: null,
			showExecutionPanel: false,
			executionNodes: [],
			executionResult: null,
			executionTime: 0,
			totalTokens: 0,
			connectionActionVisible: false,
			connectionActionPosition: { x: 0, y: 0 },
			activeConnection: null,
			tempConnection: null,
			zoom: 1,
			minZoom: 0.1,
			maxZoom: 3,
			zoomStep: 0.05,
			canvasWidth: 3000, // 初始画布宽度
			canvasHeight: 3000, // 初始画布高度
			repaintTimer: null,
			startNodeParams: [], // 开始节点参数
			canvasContextMenuVisible: false,
			canvasContextMenuPosition: { x: 0, y: 0 },
		};
	},
	mounted() {
		this.initJsPlumb();
		// 确保初始缩放值有效
		if (this.zoom <= 0) {
			this.zoom = 1;
		}
		// 延迟执行以确保 DOM 已完全渲染
		this.$nextTick(() => {
			// 自动计算合适的缩放比例
			this.$refs.zoomControl?.calculateFitZoom();
		});

		NextLoading.done();
	},
	computed: {
		isChatFlow() {
			return this.form.type === 'chatflow';
		},
		isFlow() {
			return this.form.type === 'flow';
		},
		// 确保画布尺寸始终有效
		safeCanvasWidth() {
			return Math.max(1, this.canvasWidth || 3000);
		},
		safeCanvasHeight() {
			return Math.max(1, this.canvasHeight || 3000);
		},
	},
	methods: {
		handleClosePanel() {
			this.showPanel = false;
			this.selectedNode = {};
			this.updateConnectionStyles();
		},
		// 初始化 jsPlumb
		initJsPlumb() {
			if (this.jsPlumbInstance) this.jsPlumbInstance.reset();

			this.jsPlumbInstance = jsPlumb.getInstance({
				// 连线配置为贝塞尔曲线
				Connector: [
					'Bezier',
					{
						// 改用贝塞尔曲线
						curviness: 50, // 控制曲线弧度
						stub: [20, 20], // 起始和结束点的直线部分
						gap: 8, // 连线与端点的间隙
						cornerRadius: 5, // 拐角圆角
					},
				],
				Endpoint: [
					'Dot',
					{
						radius: 3,
						fill: '#3B82F6',
					},
				],
				// 锚点配置，增加动态锚点
				Anchors: [['Right'], ['Left']],
				// 连接样式，添加白色边框效果
				PaintStyle: {
					stroke: '#94a3b8',
					strokeWidth: 2,
				},
				// hover 样式，保持边框效果
				HoverPaintStyle: {
					stroke: '#3B82F6',
				},
				// 端点样式
				EndpointStyle: {
					fill: '#3B82F6',
					stroke: '#3B82F6',
					strokeWidth: 2,
				},
				// 端点 hover 样式
				EndpointHoverStyle: {
					fill: '#3B82F6',
					stroke: '#3B82F6',
					strokeWidth: 2,
				},
				// 连线避让配置
				ConnectionsDetachable: false,
				// 允许多个连接
				MaxConnections: -1,
				Container: document.querySelector('.workflow-canvas'),
				// 连线可以跟随节点移动
				Continuous: true,
				// 锚点动态性
				DynamicAnchors: true,
				// 性能优化相关配置
				DoNotThrowErrors: true, // 不抛出错误
				EnableMouseEvents: false, // 禁用鼠标事件监听
				LogEnabled: false, // 禁用日志
				// 连线拖动配置
				ConnectionDragSelector: '.jtk-connector',
				// 禁用默认拖动行为
				DragOptions: {
					cursor: 'move',
					zIndex: 2000,
				},
				isTarget: true,
				// 使用 SVG 渲染器以提高性能
				RenderMode: 'svg',
				// 连线路径计算器
				Router: {
					type: 'Orthogonal', // 使用正交路由
					options: {
						cornerRadius: 10, // 拐角圆角
						padding: 20, // 与其他元素的间距
						midpoint: 0.5, // 中点位置
						stub: [30, 30], // 起始和结束点的直线部分
					},
				},
			});
			// 在实例创建后绑定事件
			this.jsPlumbInstance.bind('beforeDrop', (params) => {
				// 防止自己连接自己
				if (params.sourceId == params.targetId) {
					console.log('不能连接到自己');
					return false;
				}

				// 防止重复连接
				const existingConnection = this.connections.find((conn) => conn.sourceId === params.sourceId && conn.targetId === params.targetId);

				if (existingConnection) {
					console.log('连接已存在');
					return false;
				}

				this.createConnection(params.sourceId, params.targetId);

				return true;
			});

			// 连接建立的事件监听
			this.jsPlumbInstance.bind('connection', (info) => {
				this.bindConnectionEvents(info.connection);
			});

			// 连接删除的事件监听
			this.jsPlumbInstance.bind('connectionDetached', (info) => {
				this.connections = this.connections.filter((conn) => !(conn.sourceId === info.source.id && conn.targetId === info.target.id));
			});

			// 在缩放变化时重绘连线
			this.$watch('zoom', (newZoom) => {
				this.$nextTick(() => {
					// 确保缩放值有效
					if (newZoom > 0) {
						this.jsPlumbInstance.setZoom(newZoom);
					}
				});
			});

			this.loadFromStorage();
		},

		// 绑定连接事件
		bindConnectionEvents(connection) {
			// 获取连线的 DOM 元素
			const connectorElement = connection.connector.canvas;

			if (connectorElement) {
				// 使用原生 mouseenter 事件
				connectorElement.addEventListener('mouseenter', () => {
					connection.setPaintStyle({
						stroke: '#3B82F6',
					});

					connectorElement.style.cursor = 'pointer';

					// 计算连线中点位置
					const sourceEl = document.getElementById(connection.sourceId);
					const targetEl = document.getElementById(connection.targetId);

					if (sourceEl && targetEl) {
						const sourceRect = sourceEl.getBoundingClientRect();
						const targetRect = targetEl.getBoundingClientRect();

						const midX = (sourceRect.right + targetRect.left) / 2;
						const midY = (sourceRect.top + sourceRect.bottom + targetRect.top + targetRect.bottom) / 4;

						this.connectionActionPosition = { x: midX, y: midY };
						this.activeConnection = connection;
						this.connectionActionVisible = true;
					}
				});

				// 使用原生 mouseleave 事件
				connectorElement.addEventListener('mouseleave', () => {
					connection.setPaintStyle({
						stroke: '#94a3b8',
					});
					this.connectionActionVisible = false;
				});
			}
		},
		// 初始化节点可拖拽
		initNodeDraggable(node) {
			const el = document.getElementById(node.id);
			if (!el) return;

			// 设置节点为连线源和目标
			this.jsPlumbInstance.makeSource(el, {
				filter: '.node-port-output',
				anchor: 'Right',
				maxConnections: -1,
			});

			this.jsPlumbInstance.makeTarget(el, {
				filter: '.node-port-input',
				anchor: 'Left',
				maxConnections: -1,
			});

			// 拖拽配置
			this.jsPlumbInstance.draggable(el, {
				grid: [10, 10],
				containment: 'parent',
				scroll: true,
				stop: (event) => {
					// 获取节点的实际位置（相对于画布）
					const nodeEl = event.el;
					const canvasEl = this.$refs.canvas;
					const canvasRect = canvasEl.getBoundingClientRect();
					const nodeRect = nodeEl.getBoundingClientRect();

					// 计算节点相对于画布的实际位置
					const x = (nodeRect.left - canvasRect.left) / this.zoom;
					const y = (nodeRect.top - canvasRect.top) / this.zoom;

					// 更新节点位置
					const nodeIndex = this.nodes.findIndex((n) => n.id === node.id);
					if (nodeIndex !== -1) {
						this.nodes[nodeIndex] = {
							...this.nodes[nodeIndex],
							x,
							y,
						};
					}
				},
			});

			// 防抖重绘
			if (this.repaintTimer) {
				clearTimeout(this.repaintTimer);
			}
			this.repaintTimer = setTimeout(() => {
				this.jsPlumbInstance.repaintEverything();
			});
		},
		// 初始化可拖拽节点
		initDraggable() {
			this.nodes.forEach((node) => {
				this.initNodeDraggable(node);
			});
		},

		// 显示菜单
		showMenu(event, node, position, portIndex = 0) {
			event.preventDefault(); // 阻止默认右键菜单
			event.stopPropagation();

			this.contextMenuVisible = true;
			this.contextMenuNode = node;
			this.contextMenuAddPosition = position;
			this.contextMenuPortIndex = portIndex; // 保存端口索引
			this.contextMenuPosition = {
				x: event.clientX,
				y: event.clientY,
			};
		},

		// 添加节点
		addNode(type) {
			const onEndNode = (node) => {
				node.inputParams = node.inputParams || [];
				node.outputParams = node.outputParams || [];
				if (node.type === 'end') {
					node.inputParams = [
						{
							name: 'result',
							disabled: true,
						},
					];
				}
				return node;
			};

			const id = `node_${Date.now()}`;
			let newNode = {
				id,
			};
			// 将目标节点及其后续节点向右移动
			const SPACE_BETWEEN_NODES = 300;
			const Y_THRESHOLD = 100; // 判断节点是否在同一水平线上的阈值
			const nodeConfig = getNodeConfig(type);
			let x, y;

			if (this.contextMenuAddPosition === 'middle' && this.tempConnection) {
				// 在连线中间添加节点
				const { source, target, connection, portIndex } = this.tempConnection;

				// 计算中间位置，考虑缩放比例
				x = (source.x + target.x) / 2;
				y = (source.y + target.y) / 2;

				// 创建新节点
				newNode = {
					...nodeConfig,
					id,
					x: x + SPACE_BETWEEN_NODES / 2,
					y,
				};
				onEndNode(newNode);
				// 移动同一水平线上的节点
				this.nodes.forEach((node) => {
					// 判断节点是否在同一水平线上（y坐标相差不超过阈值）且在新节点右侧
					const isOnSameLevel = Math.abs(node.y - y) <= Y_THRESHOLD;
					const isOnRight = node.x >= x;

					if (isOnSameLevel && isOnRight) {
						node.x += SPACE_BETWEEN_NODES;
					}
				});
				// 添加新节点
				this.nodes.push(newNode);

				this.$nextTick(() => {
					this.jsPlumbInstance.deleteConnection(connection);
					this.createConnection(source.id, newNode.id, portIndex);
					this.createConnection(newNode.id, target.id);
					this.initNodeDraggable(newNode);
					this.tempConnection = null;
				});
			} else {
				// 原有的左右添加节点逻辑
				x = this.contextMenuNode.x + (this.contextMenuAddPosition === 'right' ? SPACE_BETWEEN_NODES : -SPACE_BETWEEN_NODES);
				y = this.contextMenuNode.y;

				// 向右添加节点，移动同一水平线上右侧的节点
				if (this.contextMenuAddPosition === 'right') {
					this.nodes.forEach((node) => {
						// 判断节点是否在同一水平线上且在新节点右侧
						const isOnSameLevel = Math.abs(node.y - y) <= Y_THRESHOLD;
						const isOnRight = node.x >= x;

						if (isOnSameLevel && isOnRight) {
							node.x += SPACE_BETWEEN_NODES;
						}
					});
				}

				newNode = {
					...nodeConfig,
					id,
					x,
					y,
				};
				onEndNode(newNode);

				this.nodes.push(newNode);

				this.$nextTick(() => {
					if (this.contextMenuAddPosition === 'right') {
						this.createConnection(this.contextMenuNode.id, newNode.id, this.contextMenuPortIndex || 0);
					} else {
						this.createConnection(newNode.id, this.contextMenuNode.id);
					}
					this.initNodeDraggable(newNode);
				});
			}
		},

		// 更新节点连线
		updateNodeConnections(node, removedCase = null) {
			if (!node || !this.jsPlumbInstance) return;

			// 保存当前的连接信息
			const currentConnections = this.jsPlumbInstance.getConnections({ source: node.id });
			const existingTargets = currentConnections.map((conn) => ({
				targetId: conn.targetId,
				portIndex: this.connections.find((c) => c.sourceId === node.id && c.targetId === conn.targetId)?.portIndex || 0,
			}));

			// 删除节点的所有现有连接
			currentConnections.forEach((conn) => {
				this.jsPlumbInstance.deleteConnection(conn);
			});

			// 如果是删除分支，需要删除对应的连接
			if (removedCase) {
				// 重新创建连接，但跳过被删除分支的连接
				existingTargets.forEach(({ targetId, portIndex }) => {
					// 如果端口索引大于删除的分支索引，需要减1
					if (portIndex > removedCase) {
						this.createConnection(node.id, targetId, portIndex - 1);
					} else if (portIndex < removedCase) {
						// 保持原有端口索引
						this.createConnection(node.id, targetId, portIndex);
					}
					// 如果端口索引等于删除的分支索引，则不重新创建连接
				});
			} else {
				// 重新创建所有连接
				existingTargets.forEach(({ targetId, portIndex }) => {
					this.createConnection(node.id, targetId, portIndex);
				});
			}
		},

		// 创建连接
		createConnection(sourceId, targetId, portIndex = 0) {
			// 获取源节点
			const sourceNode = this.nodes.find((node) => node.id === sourceId);
			if (!sourceNode) return null;

			// 计算端口位置
			let anchorPosition = [1, 0.5]; // 默认右侧中间
			// 判断是否为分支类型节点
			if (['switch', 'question'].includes(sourceNode.type)) {
				// 获取分支数量
				let portCount = 1;
				if (sourceNode.type === 'switch' && sourceNode.switchParams?.cases) {
					portCount = sourceNode.switchParams?.cases.length;
				} else if (sourceNode.type === 'question' && sourceNode.questionParams?.categories) {
					portCount = sourceNode.questionParams?.categories.length;
				}
				// 计算每个端口的垂直位置
				const portPosition = portCount > 1 ? (1 / (portCount - 1)) * portIndex : 0.5;

				// 设置锚点位置
				anchorPosition = [1, portPosition];
			}

			const connection = this.jsPlumbInstance.connect({
				source: sourceId,
				target: targetId,
				anchors: [anchorPosition, ['Left']],
				connector: [
					'Bezier',
					{
						curviness: 50,
						stub: [30, 30],
						gap: 8,
						cornerRadius: 5,
					},
				],
				paintStyle: {
					stroke: this.selectedNode && (sourceId === this.selectedNode.id || targetId === this.selectedNode.id) ? '#3B82F6' : '#94a3b8',
					strokeWidth: 2,
				},
			});

			if (connection) {
				// 检查是否已存在相同的连接
				const existingConnection = this.connections.find(
					(conn) => conn.sourceId === sourceId && conn.targetId === targetId && conn.portIndex === portIndex
				);

				if (!existingConnection) {
					this.connections.push({
						sourceId,
						targetId,
						portIndex,
					});
				}
			}

			return connection;
		},
		mouseleave() {
			if (!this.showPanel) {
				this.updateConnectionStyles();
			}
		},
		mouseenter(node) {
			this.updateConnectionStyles(node.id);
		},
		// 选择节点
		selectNode(node, event) {
			this.selectedNode = node;
			this.contextMenuVisible = false;
			event && event.stopPropagation();

			// 更新连线样式
			this.updateConnectionStyles(node.id);
		},

		// 更新连线样式
		updateConnectionStyles(selectedNodeId) {
			const connections = this.jsPlumbInstance.getAllConnections();

			connections.forEach((connection) => {
				const isRelated = connection.sourceId === selectedNodeId || connection.targetId === selectedNodeId;

				connection.setPaintStyle({
					stroke: isRelated ? '#3B82F6' : '#94a3b8',
					strokeWidth: 2,
				});

				// 强制重绘当前连接
				connection.repaint();
			});
		},

		// 从存储加载数据
		async loadFromStorage() {
			try {
				const res = await getObj(this.id); // 使用模拟函数
				this.form = res.data;
				const { dsl } = this.form;
				const state = JSON.parse(dsl || '{}');
				this.dsl = state;
				this.nodes = state.nodes || [];
				this.env = state.env || [];
				// 如果没有节点，创建默认开始节点
				if (!this.nodes || this.nodes.length === 0) {
					let startNode = getNodeConfig('start');
					startNode.id = `node_${Date.now()}`;
					startNode.x = 300;
					startNode.y = 200;
					this.nodes = [startNode];
				}

				this.$nextTick(() => {
					// 重新创建所有连接
					if (state?.connections) {
						state.connections.forEach((conn) => {
							this.createConnection(conn.sourceId, conn.targetId, conn.portIndex);
						});
					}
					this.initDraggable();
					this.updateCanvasSize();
					// 自动调整缩放
					this.$refs.zoomControl?.calculateFitZoom();
				});
			} catch (error) {
				console.error('加载工作流失败:', error);
				// 如果加载失败，创建默认开始节点
				let startNode = getNodeConfig('start');
				startNode.id = `node_${Date.now()}`;
				startNode.x = 300;
				startNode.y = 200;
				this.nodes = [startNode];

				this.$nextTick(() => {
					this.initDraggable();
					this.$refs.zoomControl?.calculateFitZoom();
				});
			}
		},

		// 处理显示更多菜单
		showContextMenu(event, node) {
			// 阻止默认右键菜单
			event.preventDefault();
			event.stopPropagation();

			// 如果是右键点击，显示更多菜单
			// 设置菜单节点和位置
			this.moreMenuNode = node;
			this.moreMenuVisible = true;

			// 计算菜单位置，确保不超出视口
			const viewportWidth = window.innerWidth;
			const viewportHeight = window.innerHeight;
			const menuWidth = 150; // 假设菜单宽度为150px
			const menuHeight = 100; // 假设菜单高度为100px

			// 计算菜单位置，避免超出视口
			let x = event.clientX;
			let y = event.clientY;

			// 如果菜单会超出右边界，则向左偏移
			if (x + menuWidth > viewportWidth) {
				x = viewportWidth - menuWidth;
			}

			// 如果菜单会超出下边界，则向上偏移
			if (y + menuHeight > viewportHeight) {
				y = viewportHeight - menuHeight;
			}

			this.menuPosition = { x, y };

			// 隐藏其他菜单
			this.contextMenuVisible = false;
			this.connectionActionVisible = false;
			this.canvasContextMenuVisible = false;
		},

		// 处理连线上添加节点
		handleConnectionAction() {
			if (!this.activeConnection) return;

			// 获取源节点和目标节点
			const sourceNode = this.nodes.find((node) => node.id === this.activeConnection.sourceId);
			const targetNode = this.nodes.find((node) => node.id === this.activeConnection.targetId);

			if (sourceNode && targetNode) {
				// 计算两个节点的中间位置
				const midX = (sourceNode.x + targetNode.x) / 2;
				const midY = (sourceNode.y + targetNode.y) / 2;

				// 显示节点添加上下文菜单
				this.contextMenuVisible = true;
				this.contextMenuPosition = {
					x: this.connectionActionPosition.x,
					y: this.connectionActionPosition.y,
				};
				this.contextMenuNode = {
					...sourceNode,
					x: midX,
					y: midY,
				};
				this.contextMenuAddPosition = 'middle';

				// 保存当前连接以便后续处理
				this.tempConnection = {
					source: sourceNode,
					target: targetNode,
					connection: this.activeConnection,
				};
			}

			this.connectionActionVisible = false;
			this.activeConnection = null;
		},

		// 删除连线
		handleDeleteConnection() {
			if (this.activeConnection) {
				this.$confirm('确定要删除这条连线吗?', '提示', {
					confirmButtonText: '确定',
					cancelButtonText: '取消',
					type: 'warning',
				})
					.then(() => {
						// 从 jsPlumb 实例中删除连线
						this.jsPlumbInstance.deleteConnection(this.activeConnection);
						this.connectionActionVisible = false;
						this.activeConnection = null;
					})
					.catch(() => {
						// 取消删除操作
					});
			}
		},

		// 开始拖拽
		startDrag(event) {
			// 只有当点击的是容器背景时才允许拖拽
			if (event.target === event.currentTarget || event.target.classList.contains('workflow-canvas')) {
				this.isDragging = true;
				this.dragStart = {
					x: event.clientX - this.position.x,
					y: event.clientY - this.position.y,
				};
				event.currentTarget.style.cursor = 'grabbing';
				event.preventDefault();
			}
		},

		// 拖拽中
		onDrag(event) {
			if (this.isDragging) {
				const newX = event.clientX - this.dragStart.x;
				const newY = event.clientY - this.dragStart.y;

				this.position = {
					x: newX,
					y: newY,
				};

				event.preventDefault();
			}
		},

		// 停止拖拽
		stopDrag(event) {
			if (this.isDragging) {
				this.isDragging = false;
				if (event.currentTarget) {
					event.currentTarget.style.cursor = 'grab';
				}
			}
		},

		// 更新画布尺寸
		updateCanvasSize() {
			const padding = 500; // 额外的边距
			let maxX = 0;
			let maxY = 0;

			// 计算所有节点占用的最大范围
			this.nodes.forEach((node) => {
				maxX = Math.max(maxX, node.x + 300); // 300是节点宽度加一些边距
				maxY = Math.max(maxY, node.y + 200); // 200是节点高度加一些边距
			});

			// 设置画布尺寸，确保足够大且始终为正值
			this.canvasWidth = Math.max(3000, maxX + padding);
			this.canvasHeight = Math.max(3000, maxY + padding);
		},

		// 处理滚轮缩放
		handleWheel(event) {
			if (event.ctrlKey || event.metaKey) {
				// 隐藏所有菜单
				this.connectionActionVisible = false;
				this.contextMenuVisible = false;
				this.moreMenuVisible = false;
				this.canvasContextMenuVisible = false;
				event.preventDefault();
				const delta = event.deltaY > 0 ? -this.zoomStep : this.zoomStep;
				const newZoom = Math.max(this.minZoom, Math.min(this.maxZoom, this.zoom + delta));

				// 确保缩放值始终为正数，防止SVG高度计算出现-Infinity
				if (newZoom <= 0) return;

				// 计算以鼠标位置为中心的缩放
				const rect = event.currentTarget.getBoundingClientRect();
				const x = event.clientX - rect.left;
				const y = event.clientY - rect.top;

				const newPosition = {
					x: x - (x - this.position.x) * (1 + delta),
					y: y - (y - this.position.y) * (1 + delta),
				};

				this.zoom = newZoom;
				this.position = newPosition;
			}
		},

		// 处理画布右键菜单
		handleCanvasContextMenu(event) {
			event.preventDefault();
			event.stopPropagation();
			this.contextMenuVisible = false;
			// 只有当点击的是画布背景时才显示菜单
			if (event.target === event.currentTarget || event.target.classList.contains('workflow-canvas')) {
				this.canvasContextMenuVisible = true;
				this.canvasContextMenuPosition = {
					x: event.clientX,
					y: event.clientY,
				};
			}
		},

		// 处理添加节点
		handleAddNode() {
			setTimeout(() => {
				this.contextMenuVisible = true;
				this.contextMenuPosition = {
					x: this.canvasContextMenuPosition.x,
					y: this.canvasContextMenuPosition.y,
				};
			}, 0);
		},

		// 处理导入DSL
		handleImportDSL() {
			// 创建隐藏的文件输入
			const input = document.createElement('input');
			input.type = 'file';
			input.accept = '.json';
			input.onchange = async (event) => {
				const file = event.target.files[0];
				if (!file) return;

				const reader = new FileReader();
				reader.onload = async (e) => {
					try {
						const content = JSON.parse(e.target.result);
						// 更新当前工作流的DSL
						await update({
							id: route.params.id,
							dsl: JSON.stringify(content),
						});
						ElMessage.success('导入成功');
						// 刷新页面
						window.location.reload();
					} catch (error) {
						console.error('导入失败:', error);
						ElMessage.error('导入失败，请检查文件格式是否正确');
					}
				};
				reader.readAsText(file);
			};
			input.click();
		},

		// 处理导出DSL
		handleExportDSL() {
			try {
				const dslData = {
					nodes: this.nodes,
					connections: this.connections,
					env: this.env,
				};

				// 创建下载链接
				const dataStr = JSON.stringify(dslData, null, 2);
				const dataBlob = new Blob([dataStr], { type: 'application/json' });
				const url = window.URL.createObjectURL(dataBlob);
				const link = document.createElement('a');
				link.href = url;
				link.download = `workflow_${Date.now()}.json`;
				document.body.appendChild(link);
				link.click();
				document.body.removeChild(link);
				window.URL.revokeObjectURL(url);

				ElMessage.success('DSL导出成功');
			} catch (error) {
				console.error('导出DSL失败:', error);
				ElMessage.error('导出DSL失败');
			}
		},

		async update(data) {
			// 使用模拟响应代替调用 API
			const response = putObj(data);
			console.log(response);
			return response;
		},

		// 处理节点的双击事件
		handleNodeDblClick(node, event) {
			this.showPanel = true;
		},
	},
	beforeUnmount() {
		if (this.repaintTimer) {
			clearTimeout(this.repaintTimer);
		}
	},
};
</script>

<style lang="scss" scoped>
.workflow-designer {
	position: relative;
	display: flex;
	width: 100%;
	height: 100vh;
	overflow: hidden;
	background: #f5f7fa;

	.workflow-main {
		height: 100%;
		flex: 1;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}
}

.workflow-container {
	width: 100%;
	height: 100%;
	position: relative;
	overflow: hidden;
	cursor: grab;
	background: #f8f9fc;
	background-image: linear-gradient(rgba(229, 231, 235, 0.3) 1px, transparent 1px),
		linear-gradient(90deg, rgba(229, 231, 235, 0.3) 1px, transparent 1px);
	background-size: 20px 20px;
	user-select: none;

	// 确保背景网格在缩放时保持固定大小
	&::before {
		content: '';
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		pointer-events: none;
		background-image: inherit;
		background-size: inherit;
	}
}

.workflow-canvas {
	position: absolute;
	transform-origin: 0 0;
	will-change: transform;
	pointer-events: none; // 防止画布本身接收事件

	// 但是画布中的内容需要可以接收事件
	> * {
		pointer-events: auto;
	}
}

/* 确保节点在画布上方 */
.workflow-node {
	position: absolute;
	z-index: 2;
	transition: transform 0.1s ease-out; // 添加平滑过渡效果
}

/* 确保连线在节点下方 */
.jtk-connector {
	z-index: 1;
	pointer-events: all !important;
	cursor: pointer;
	transition: all 0.1s ease-out; // 连接线的过渡效果
}

.jtk-connector:hover {
	stroke: #3b82f6 !important;
	stroke-width: 2px !important;
}

/* 确保端点在最上层 */
.jtk-endpoint {
	z-index: 3;
	pointer-events: all !important;
}

.connection-action {
	position: fixed;
	transform: translate(-50%, -50%);
	z-index: 1000;
	pointer-events: auto;
	display: flex;
	gap: 4px;
	padding: 4px;
	border-radius: 4px;

	.connection-action-buttons {
		display: flex;
	}

	.action-btn {
		width: 20px;
		height: 20px;
		padding: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 50%;
		transition: all 0.2s ease;
		border: none;
		cursor: pointer;
		font-size: 12px;

		&:hover {
			transform: scale(1.1);
		}

		&.add-node-btn {
			background-color: #3b82f6;

			&:hover {
				background-color: #2563eb;
			}
		}

		&.delete-node-btn {
			background-color: #ef4444;

			&:hover {
				background-color: #dc2626;
			}
		}
	}
}
</style>
<style lang="scss">
@use './styles/flow.scss';
</style>
