import { ProcessInputParamsNode, InputParams, Params } from '../types/utils';

/**
 * 处理输入参数,将对象类型参数转换为字符串
 * @param node - 当前节点
 * @param inputParams - 输入的参数对象
 * @param nodes - 所有节点列表
 * @returns 处理后的参数对象
 */
export const processInputParams = (node: ProcessInputParamsNode, inputParams: InputParams, nodes: ProcessInputParamsNode[]): Params => {
	const params: Params = {};
	node.inputParams?.forEach((item) => {
		const { name, type } = item;
		let sourceType: string | undefined;
		// 将type按照.分割成数组,获取节点id和参数key
		const [id, key] = type?.split('.') || [];
		let sourceNode = nodes.find((n) => n.id === id);
		if (sourceNode) {
			const sourceParams = sourceNode.outputParams?.find((n) => n.name == key);
			if (sourceParams) {
				sourceType = sourceParams.type;
			}
		}
		switch (sourceType) {
			case 'String':
				params[name] = typeof inputParams[type] === 'object' ? JSON.stringify(inputParams[type]) : String(inputParams[type]);
				break;
			case 'Number':
				params[name] = Number(inputParams[type]);
				break;
			case 'Boolean':
				params[name] = Boolean(inputParams[type]);
				break;
			case 'Object':
				params[name] = typeof inputParams[type] === 'string' ? JSON.parse(inputParams[type]) : inputParams[type];
				break;
			case 'Array':
				params[name] = Array.isArray(inputParams[type]) ? inputParams[type] : JSON.parse(inputParams[type]);
				break;
			default:
				params[name] = inputParams[type];
		}
	});
	return params;
};

/**
 * 替换字符串中的变量占位符
 * @param str - 包含变量占位符的字符串
 * @param params - 变量参数对象
 * @returns 替换后的字符串
 */
export const replaceVariable = (str: string, params: Params): string => {
	// 检查是否存在${xxx}格式的表达式
	const regex = /\$\{([^}]+)\}/;
	const match = str.match(regex);

	// 如果没有表达式直接返回
	if (!match) {
		return str;
	}

	// 获取表达式内容,如 arg[0] 或 arg.data
	const expr = match[1];

	// 解析表达式获取实际值
	let value: any;
	try {
		// 处理数组索引访问 如 arg[0]
		// 使用正则匹配复杂的属性访问表达式
		const propRegex = /^([^.\[]+)(?:\.([^.\[]+)|\[(\d+)\])*$/;
		const parts = expr.match(propRegex);

		if (parts) {
			// 从params获取根对象
			let result = params[parts[1]];

			// 解析剩余的属性访问路径
			const accessors = expr.slice(parts[1].length).match(/(?:\.([^.\[]+)|\[(\d+)\])/g) || [];

			// 依次访问每个属性
			for (const accessor of accessors) {
				if (accessor.startsWith('.')) {
					// 处理点号访问 如 .data
					result = result[accessor.slice(1)];
				} else {
					// 处理数组索引访问 如 [0]
					const index = parseInt(accessor.slice(1, -1));
					result = result[index];
				}
			}

			value = result;
		}
		// 直接变量
		else {
			value = params[expr];
		}
	} catch (e) {
		console.warn(`解析表达式 ${expr} 失败:`, e);
		value = '';
	}

	// 将解析后的值替换回字符串
	return str.replace(regex, value);
};
