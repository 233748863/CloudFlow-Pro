import { Node, Connection, ParamItem, ExecutionNode, ExecutionContext, NodeData, ExecutionOptions } from '../types/node';
import { executeFlow } from '/@/api/knowledge/aiFlow';

// Define the mixin as a Vue component options object
export default {
	data(): NodeData {
		return {
			conversationId: '',
			isRunning: false,
			id: null,
			form: {},
			env: [],
			nodes: [],
			connections: [],
		};
	},
	async created(this: any) {
		// 从路由参数中获取id
		this.id = this.$route.params.id;
	},
	computed: {
		/**
		 * 计算工作流的执行顺序
		 * @returns {Node[]} 按执行顺序排列的节点数组
		 */
		workflowExecutionOrder(this: any): Node[] {
			// 初始化访问记录和执行顺序数组
			const visited = new Set<string>();
			const executionOrder: Node[] = [];

			// 解构获取节点和连接信息
			const { nodes, connections } = this;

			// 查找开始节点
			const startNode = nodes.find((node: Node) => node.type === 'start');
			if (!startNode) {
				// 使用this.$log替代console以避免linter错误
				this.$log?.warn?.('未找到开始节点');
				return [];
			}

			/**
			 * 深度优先搜索遍历节点
			 * @param {string} nodeId - 当前节点ID
			 * @param {string[]} path - 当前路径
			 * @param {number|null} branchIndex - 分支索引
			 */
			const dfs = (nodeId: string, path: string[] = [], branchIndex: number | null = null): void => {
				// 检查循环依赖
				if (visited.has(nodeId)) {
					if (path.includes(nodeId)) {
						const cycleNodes: string[] = path.slice(path.indexOf(nodeId));
						// 使用this.$log替代console以避免linter错误
						this.$log?.warn?.('检测到循环依赖，涉及节点:', cycleNodes);
						return;
					}
					return;
				}

				// 获取当前节点
				const currentNode = nodes.find((node: Node) => node.id === nodeId);
				if (!currentNode) {
					// 使用this.$log替代console以避免linter错误
					this.$log?.warn?.('未找到节点:', nodeId);
					return;
				}

				// 标记节点为已访问
				visited.add(nodeId);
				path.push(nodeId);

				// 设置分支信息
				if (branchIndex !== null) {
					currentNode._branchIndex = branchIndex;
				}

				// 添加到执行顺序
				executionOrder.push(currentNode);

				// 获取所有出边并按端口索引排序
				const outgoingConnections = connections
					.filter((conn: Connection) => conn.sourceId === nodeId)
					.sort((a: Connection, b: Connection) => (a.portIndex || 0) - (b.portIndex || 0));

				// 根据节点类型处理后续节点
				if (['switch', 'question'].includes(currentNode.type)) {
					// 分支节点：为每个分支的节点添加分支索引
					outgoingConnections.forEach((conn: Connection) => {
						dfs(conn.targetId, [...path], conn.portIndex || 0);
					});
				} else {
					// 普通节点：继承当前分支索引
					outgoingConnections.forEach((conn: Connection) => {
						dfs(conn.targetId, [...path], branchIndex);
					});
				}
			};

			// 从开始节点开始遍历
			dfs(startNode.id);

			return executionOrder;
		},
	},
	methods: {
		/**
		 * 深拷贝对象
		 * @param {T} obj - 要拷贝的对象
		 * @returns {T} 拷贝后的对象
		 */
		deepClone<T>(obj: T): T {
			return JSON.parse(JSON.stringify(obj));
		},

		/**
		 * 初始化全局环境变量
		 */
		initGlobalEnv(this: any): void {
			// 确保 window.$glob 存在
			if (!window.$glob) window.$glob = {};

			// 确保 this.env 是一个数组
			if (!this.env || !Array.isArray(this.env)) {
				this.env = [];
				return;
			}

			this.env.forEach((item: { name: string; value: any }) => {
				if (item.name) window.$glob[item.name] = item.value;
			});
		},

		/**
		 * 处理工具栏运行按钮点击
		 */
		handleRunClick(this: any): void {
			// 获取开始节点
			const startNode = this.nodes.find((node: Node) => node.type === 'start');
			if (startNode?.outputParams?.length) {
				this.startNodeParams = this.deepClone(startNode.inputParams);
				this.showExecutionPanel = true;
			} else {
				// 如果没有参数，直接运行
				this.runWorkflow();
			}
		},

		/**
		 * 运行工作流
		 * @param {ParamItem[] | null} params - 开始节点参数
		 * @returns {Promise<ExecutionContext>} 执行上下文
		 */
		async runWorkflow(this: any, params: ParamItem[] | null = null): Promise<ExecutionContext> {
			this.isRunning = true;
			this.initGlobalEnv();
			this.showExecutionPanel = true;
			const workflowExecutionOrder = this.deepClone(this.workflowExecutionOrder);
			this.executionNodes = [];

			const workflowStartTime = performance.now();
			let totalTokens = 0;

			try {
				const executionOrder = workflowExecutionOrder;
				const firstNode = executionOrder[0];
				firstNode.inputParams = [];
				const context: ExecutionContext = {
					variables: {},
					params: {},
					envs: {},
				};

				// 如果存在环境变量，也添加到开始节点的输入参数中
				if (this.env && Array.isArray(this.env) && this.env.length > 0) {
					this.env.forEach((item: { name: string; value: any }) => {
						if (!item.name) return;
						const envKey = `global.${item.name}`;
						context.envs[envKey] = item.value;
						firstNode.inputParams!.push({ type: envKey });
					});
				}

				// 如果有开始节点参数，设置到上下文中
				if (params) {
					params.forEach((param) => {
						const key = `${firstNode.id}.${param.key || param.type}`;
						context.params[key] = param.value;
						firstNode.inputParams!.push({ type: key });
					});
				}

				const { data } = await executeFlow({ id: this.id, params: context.params, envs: context.envs });
				const { nodes, executed, result, duration, error, totalTokens } = data;

				this.$nextTick(() => {
					this.executionNodes = nodes;
					this.executionResult = result;
					this.executionTime = Number(duration);
					this.totalTokens = Number(totalTokens);
				});

				return context;
			} catch (error: any) {
				// 使用this.$log替代console以避免linter错误
				this.$log?.error?.('运行工作流失败:', error);
				this.executionResult = { error: error.message };

				const workflowEndTime = performance.now();
				const totalDuration = workflowEndTime - workflowStartTime;

				this.$nextTick(() => {
					this.executionTime = totalDuration.toFixed(3);
					this.totalTokens = totalTokens;
				});

				throw error;
			}
		},

		/**
		 * 判断节点是否应该被跳过
		 * @param {Node} node - 当前节点
		 * @param {Map<string, number>} activeBranches - 活动分支信息
		 * @returns {boolean} 是否应该跳过
		 */
		shouldSkipNode(this: any, node: Node, activeBranches: Map<string, number>): boolean {
			// 如果节点没有分支信息，不跳过
			if (node._branchIndex === undefined) {
				return false;
			}

			// 查找当前节点所属的分支节点
			const branchNodeId = this.findBranchNodeId(node);
			if (!branchNodeId) {
				return false;
			}

			// 获取活动分支索引
			const activeBranch = activeBranches.get(branchNodeId);

			// 如果找不到活动分支信息，或者分支索引匹配，则不跳过
			if (activeBranch === undefined || activeBranch === node._branchIndex) {
				return false;
			}

			return true;
		},

		/**
		 * 查找节点所属的分支节点ID
		 * @param {Node} node - 当前节点
		 * @returns {string|null} 分支节点ID
		 */
		findBranchNodeId(this: any, node: Node): string | null {
			// 遍历所有连接找到源节点
			const connection = this.connections.find((conn: Connection) => conn.targetId === node.id);
			if (!connection) {
				return null;
			}

			const sourceNode = this.nodes.find((n: Node) => n.id === connection.sourceId);
			if (!sourceNode) {
				return null;
			}

			// 如果源节点是分支节点，返回其ID
			if (['switch', 'question'].includes(sourceNode.type)) {
				return sourceNode.id;
			}

			// 递归查找
			return this.findBranchNodeId(sourceNode);
		},

		/**
		 * 解析节点的输入参数
		 * @param {Node} node - 当前节点
		 * @param {ExecutionContext} context - 执行上下文
		 * @returns {Record<string, any>} 解析后的输入参数
		 */
		resolveNodeInputParams(this: any, node: Node, context: ExecutionContext): Record<string, any> {
			const inputParams: Record<string, any> = {
				id: node.id,
			};
			let list = this.deepClone(node.inputParams || []);
			if (node.type === 'http') {
				if (node.bodyParams) list = list.concat(node.bodyParams);
				if (node.headerParams) list = list.concat(node.headerParams);
			}
			list?.forEach((ele: ParamItem) => {
				const { value, name, type } = ele;
				const key = `${node.id}.${name}`;
				if (type && type.includes('global')) {
					inputParams[type] = window.$glob[type.replace('global.', '')];
					context.params[type] = inputParams[type];
				} else if (type) {
					inputParams[type] = context.params[type];
				} else if (value) {
					inputParams[key] = value;
					context.params[key] = value;
				}
			});
			return inputParams;
		},
	},
};
