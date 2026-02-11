import variables from '/@/assets/styles/variables.module.scss';

export const flowJsonOption = {
	nodes: [
		{
			id: '1706150553091901403',
			type: 'start',
			x: 200,
			y: 100,
			properties: {
				variables: [],
				structs: [],
				frontend_status: '0',
			},
			text: {
				x: 200,
				y: 100,
				value: '模型基础配置',
			},
		},
		{
			id: '1713515657342573573',
			type: 'funcDesc',
			x: 200,
			y: 200,
			text: {
				x: 200,
				y: 200,
				value: '函数描述',
			},
		},
		{
			id: '1713515657342573574',
			type: 'exec',
			x: 200,
			y: 300,
			text: {
				x: 200,
				y: 300,
				value: '调用大模型',
			},
		},
		{
			id: '17135156573425735745',
			type: 'result',
			x: 200,
			y: 400,
			text: {
				x: 200,
				y: 400,
				value: '结果处理',
			},
		},
		{
			id: '17135156573425735746',
			type: 'endParallel',
			x: 200,
			y: 500,
			text: {
				x: 200,
				y: 500,
				value: '输出结果',
			},
		},
	],
	edges: [
		{
			id: '1713515665489870839',
			type: 'myBezier',
			sourceNodeId: '1706150553091901403',
			targetNodeId: '1713515657342573573',
		},
		{
			id: '1713515665489870840',
			type: 'myBezier',
			sourceNodeId: '1713515657342573573',
			targetNodeId: '1713515657342573574',
		},
		{
			id: '1713515665489870841',
			type: 'myBezier',
			sourceNodeId: '1713515657342573574',
			targetNodeId: '17135156573425735745',
		},
		{
			id: '1713515665489870842',
			type: 'myBezier',
			sourceNodeId: '17135156573425735745',
			targetNodeId: '17135156573425735746',
		},
	],
};

export const flowJsonThemeOption = {
	baseNode: {
		fill: '#FFFFFF',
		stroke: '#000000',
		strokeWidth: 1,
	},
	circle: {
		stroke: '#000000',
		strokeWidth: 1,
	},
	rect: {
		fill: '#FFFFFF',
		stroke: '#000000',
		outlineColor: '#88f',
		strokeWidth: 1,
	},
	polygon: {
		strokeWidth: 1,
	},
	polyline: {
		stroke: '#000000',
		hoverStroke: '#000000',
		selectedStroke: '#000000',
		strokeWidth: 1,
	},
	nodeText: {
		color: '#000000',
		overflowMode: 'ellipsis', //超出显示省略号
		padding: '0 15px',
		fontSize: 14,
	},
	edgeText: {
		color: '#000000',
		background: {
			fill: variables.dragPanelBgColor,
		},
	},
};
