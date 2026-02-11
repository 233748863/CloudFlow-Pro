// 供应商
export const providers = [
	{ label: 'OpenAI协议', value: 'OpenAI' },
	{ label: '阿里百炼', value: 'Aliyun' },
	{ label: '火山方舟', value: 'Ark' },
	{ label: 'DeepSeek', value: 'DeepSeek' },
	{ label: '智谱清言', value: 'ChatGLM' },
	{ label: '硅基流动', value: 'Siliconflow' },
	{ label: 'Ollama', value: 'Ollama' },
	{ label: 'OpenRouter', value: 'OpenRouter' },
	{ label: '搜索服务', value: 'BoCha' },
];

// 模型类型
export const modelTypes = [
	{ label: '聊天', value: 'Chat' },
	{ label: '推理', value: 'Reason' },
	{ label: '向量', value: 'Embedding' },
	{ label: '图片', value: 'Image' },
	{ label: '视觉', value: 'Vision' },
	{ label: '音频', value: 'Voice' },
	{ label: '搜索', value: 'Search' },
];

// 各供应商的模型映射
export const providerModels = {
	Aliyun: [
		{ type: 'Chat', model: 'qwen-max-latest' },
		{ type: 'Chat', model: 'qwen-plus' },
		{ type: 'Vision', model: 'qwen-vl-plus-latest' },
		{ type: 'Vision', model: 'qwen-vl-max-latest' },
		{ type: 'Vision', model: 'qwen-vl-ocr' },
		{ type: 'Embedding', model: 'text-embedding-v3' },
		{ type: 'Image', model: 'flux-schnell' },
		{ type: 'Voice', model: 'paraformer-v2' },
		{ type: 'Voice', model: 'cosyvoice-v1' },
	],
	Ark: [
		{ type: 'Chat', model: 'deepseek-v3-250324' },
		{ type: 'Chat', model: 'doubao-1-5-pro-32k-250115' },
		{ type: 'Reason', model: 'deepseek-r1-250120' },
		{ type: 'Vision', model: 'doubao-1-5-vision-pro-32k-250115' },
		{ type: 'Embedding', model: 'doubao-embedding-large-text-240915' },
	],
	DeepSeek: [
		{ type: 'Chat', model: 'deepseek-chat' },
		{ type: 'Reason', model: 'deepseek-reasoner' },
	],
	ChatGLM: [
		{ type: 'Chat', model: 'glm-4-flash' },
		{ type: 'Chat', model: 'glm-4-plus' },
		{ type: 'Vision', model: 'glm-4v-flash' },
		{ type: 'Vision', model: 'glm-4v-plus' },
		{ type: 'Embedding', model: 'embedding-3' },
	],
	OpenAI: [
		{ type: 'Chat', model: 'gpt-4o-mini' },
		{ type: 'Chat', model: 'gpt-4o' },
		{ type: 'Vision', model: 'gpt-4o' },
		{ type: 'Embedding', model: 'text-embedding-3-small' },
		{ type: 'Embedding', model: 'text-embedding-3-large' },
	],
	Siliconflow: [
		{ type: 'Image', model: 'black-forest-labs/FLUX.1-schnell' },
		{ type: 'Image', model: 'stabilityai/stable-diffusion-3-5-large' },
		{ type: 'Image', model: 'Kwai-Kolors/Kolors' },
		{ type: 'Voice', model: 'FunAudioLLM/SenseVoiceSmall' },
		{ type: 'Reason', model: 'deepseek-ai/DeepSeek-R1' },
		{ type: 'Chat', model: 'deepseek-ai/DeepSeek-V3' },
		{ type: 'Vision', model: 'Qwen/Qwen2.5-VL-72B-Instruct' },
		{ type: 'Vision', model: 'Qwen/Qwen2.5-VL-32B-Instruct' },
		{ type: 'Embedding', model: 'BAAI/bge-m3' },
		{ type: 'Embedding', model: 'BAAI/bge-large-zh-v1.5' },
	],
	Ollama: [
		{ type: 'Chat', model: 'qwen2.5:14b' },
		{ type: 'Chat', model: 'qwen2.5:32b' },
		{ type: 'Chat', model: 'qwen2.5:72b' },
		{ type: 'Embedding', model: 'bge-m3:latest' },
		{ type: 'Embedding', model: 'shaw/dmeta-embedding-zh' },
		{ type: 'Vision', model: 'minicpm-v:latest' },
		{ type: 'Chat', model: 'deepseek-r1:8b' },
		{ type: 'Reason', model: 'deepseek-r1:14b' },
	],
	OpenRouter: [
		{ type: 'Chat', model: 'deepseek/deepseek-v3-base:free' },
		{ type: 'Chat', model: 'openrouter/quasar-alpha' },
		{ type: 'Vision', model: 'qwen/qwen2.5-vl-72b-instruct:free' },
		{ type: 'Reason', model: 'deepseek/deepseek-r1:free' },
		{ type: 'Reason', model: 'qwen/qwq-32b:free' }
	],
	BoCha: [
		{ type: 'Search', model: 'bocha-web-search' },
		{ type: 'Search', model: 'sear-xng' },
	],
};

// 默认的 baseURL 的映射
export const providerBaseURLMap = {
	OpenAI: 'https://api.openai-hk.com/v1',
	Ark: 'https://ark.cn-beijing.volces.com/api/v3',
	Aliyun: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
	DeepSeek: 'https://api.deepseek.com/v1',
	Ollama: 'http://localhost:11434/v1',
	Siliconflow: 'https://api.siliconflow.cn/v1',
	OpenRouter: 'https://openrouter.ai/api/v1',
	ChatGLM: 'https://open.bigmodel.cn/api/paas/v4',
	MiniMax: 'https://api.minimax.chat/v1',
	Claude: 'https://api.anthropic.com/v1',
	BoCha: 'https://api.bochaai.com/v1/',
};
