import { Node, ParamItem } from '../types/node';
import { PanelComponent, PreviousNodeOutput } from '../types/panel';

export default {
	inject: ['parent'],
	props: {
		node: {
			type: Object as () => Node,
			required: true,
		},
	},
	data() {
		return {
			inputParams: this.node.inputParams || [],
			outputParams: this.node.outputParams || [],
		};
	},
	computed: {
		// 获取所有上级节点的输入参数
		previousInputParams(): Array<{ id: string; name: string; list: ParamItem[] }> {
			const previousNodes = this.previousNodes;
			return previousNodes.map((node) => {
				const { id, name, inputParams = [] } = node;
				return {
					id: id,
					name: name,
					list: inputParams || [],
				};
			});
		},
		// 获取所有上级节点的输出参数和全局环境变量
		previousOutputParams(): PreviousNodeOutput[] {
			const previousNodes = this.previousNodes;
			const nodeOutputs = previousNodes.map((node) => {
				const { id, name, outputParams = [] } = node;
				return {
					id: id,
					name: name,
					list: outputParams,
				};
			});

			// 添加全局环境变量
			if ((this as any).parent.env && (this as any).parent.env.length) {
				nodeOutputs.push({
					id: 'global',
					name: '全局环境变量',
					list: (this as any).parent.env.map((env: { name: string; value: any }) => ({
						name: env.name,
						value: 'global',
					})),
				});
			}

			return nodeOutputs;
		},
		// 递归获取所有上级节点
		previousNodes(): Node[] {
			const nodes: Node[] = [];
			const findPreviousNodes = (nodeId: string): void => {
				const connection = (this as any).parent.connections.find((conn: { targetId: string }) => conn.targetId === nodeId);
				if (!connection) return;

				const node = (this as any).parent.nodes.find((node: Node) => node.id === connection.sourceId);
				if (node) {
					nodes.push(node);
					findPreviousNodes(node.id);
				}
			};

			findPreviousNodes(this.node.id);
			return nodes;
		},
		nextNode(): Node {
			const connection = (this as any).parent.connections.find((conn: { sourceId: string }) => conn.sourceId === this.node.id);
			if (!connection) return {} as Node;
			return (this as any).parent.nodes.find((node: Node) => node.id === connection.targetId) || ({} as Node);
		},
	},

	watch: {
		outputParams: {
			deep: true,
			handler(): void {
				this.updateVariables();
			},
		},
		inputParams: {
			deep: true,
			handler(): void {
				this.updateVariables();
			},
		},
	},
	methods: {
		addParam(): void {
			this.inputParams.push({
				name: `arg${this.inputParams.length + 1}`,
				type: '',
			});
		},
		addOutput(): void {
			this.outputParams.push({
				name: `result${this.outputParams.length + 1}`,
				type: '',
			});
		},

		removeParam(index: number): void {
			this.inputParams.splice(index, 1);
		},

		removeOutput(index: number): void {
			this.outputParams.splice(index, 1);
		},
		updateVariables(): void {
			this.node.outputParams = [...this.outputParams];
			this.node.inputParams = [...this.inputParams];
			(this as any).$emit('update:node', this.node);
		},
	},
};
