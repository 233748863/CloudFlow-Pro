<template>
	<div class="flex flex-col flex-1 w-full h-full">
		<!-- 顶部操作栏-->
		<header class="flex justify-end text-gray-700 bg-white dark:text-gray-300 dark:bg-gray-800">
			<svg
				v-if="showClearButton"
				t="1711092183051"
				@click="clearStoreMessageList"
				class="mr-2 w-6 h-6"
				viewBox="0 0 1024 1024"
				version="1.1"
				xmlns="http://www.w3.org/2000/svg"
				p-id="5251"
				width="128"
				height="128"
			>
				<path
					d="M274.56 798.997333l19.434667-25.130666-33.792 68.565333a18.133333 18.133333 0 0 0 11.562666 25.536l59.733334 16a18.133333 18.133333 0 0 0 17.28-4.48c20.522667-19.818667 35.626667-35.989333 45.290666-48.469333l19.456-25.130667-33.813333 68.565333a18.133333 18.133333 0 0 0 11.562667 25.536l84.48 22.634667a18.133333 18.133333 0 0 0 17.28-4.48c20.522667-19.84 35.626667-35.989333 45.269333-48.469333l19.456-25.130667-33.813333 68.565333A18.133333 18.133333 0 0 0 535.530667 938.666667l72.106666 19.328a18.133333 18.133333 0 0 0 17.28-4.48c20.522667-19.84 35.626667-36.010667 45.269334-48.490667l19.456-25.130667-33.813334 68.565333a18.133333 18.133333 0 0 0 11.584 25.514667l86.421334 23.338666 3.84-0.213333c13.269333-0.704 29.056-5.034667 43.84-12.8 29.781333-15.701333 48.170667-43.2 52.181333-78.250667 2.133333-18.517333 4.778667-38.549333 8.405333-63.530666 1.642667-11.221333 2.944-20.010667 6.229334-41.834667 11.050667-73.322667 14.634667-101.034667 17.130666-133.674667l0.938667-12.373333 2.837333-2.922667 12.330667-1.344a41.813333 41.813333 0 0 0 24.810667-11.221333c10.730667-10.24 14.805333-25.386667 11.093333-42.197333l-37.546667-171.584c-3.029333-13.696-11.264-27.946667-23.146666-39.829334-11.648-11.626667-25.92-20.138667-39.893334-23.893333L723.626667 331.306667l-2.261334-3.92534L774.250667 130.133333c8.32-31.061333-11.754667-63.744-44.970667-72.64l-79.509333-21.312c-33.194667-8.896-66.922667 9.365333-75.264 40.426667l-52.842667 197.269333-3.925333 2.261334-118.101334-31.63734c-13.994667-3.754667-30.634667-3.498667-46.506666 0.746667-16.256 4.352-30.506667 12.586667-39.957334 22.933333l-118.314666 129.792c-11.605333 12.714667-15.658667 27.84-11.52 42.090667 4.16 14.229333 15.850667 25.194667 25.194667 30.528l13.610666 4.266667 2.133334 3.882666-3.626667 13.802667c-21.12 79.850667-52.885333 136.917333-85.717333 150.890667-47.530667 20.202667-72.938667 49.429333-78.421334 85.034666-5.034667 32.682667 9.28 67.114667 37.589334 91.541334l22.037333 8.341333 74.666667 20.010667a42.666667 42.666667 0 0 0 41.216-11.050667c15.274667-15.274667 26.88-28.032 34.837333-38.293333z m551.381333-396.565333c14.144 3.797333 29.952 19.2 32.768 32l34.56 157.781333a10.666667 10.666667 0 0 1-13.184 12.586667L240.64 433.493333a10.666667 10.666667 0 0 1-5.12-17.493333l108.8-119.36c8.832-9.685333 30.229333-15.146667 44.373333-11.349333l141.333334 37.866666a21.333333 21.333333 0 0 0 26.133333-15.082666l58.304-217.642667a21.333333 21.333333 0 0 1 26.133333-15.082667l77.056 20.650667a21.333333 21.333333 0 0 1 15.082667 26.133333l-58.325333 217.642667a21.333333 21.333333 0 0 0 15.082666 26.112l136.448 36.565333zM315.456 701.568c-33.664 45.141333-64.597333 79.082667-92.8 101.802667l-5.909333 4.778666-2.837334 0.597334-88.106666-24.106667-2.922667-3.2c-13.034667-14.165333-19.370667-31.04-16.981333-46.592 3.285333-21.333333 22.058667-39.338667 53.205333-52.586667 31.722667-13.482667 59.818667-47.104 82.922667-99.904 10.026667-22.954667 18.88-48.725333 26.389333-76.586666l3.882667-14.4 3.904-2.26134 566.165333 151.701334 2.346667 3.306666-0.789334 12.224c-1.984 30.592-30.336 229.397333-32.128 244.906667-2.346667 20.416-11.306667 34.986667-27.605333 44.394667a73.237333 73.237333 0 0 1-21.397333 8.106666l-5.013334 0.725334-60.373333-16.170667 11.242667-20.288c8.277333-14.976 22.656-43.84 43.093333-86.613333a21.12 21.12 0 0 0-9.962667-28.16l-3.136-1.493334a21.333333 21.333333 0 0 0-26.261333 6.485334c-33.642667 45.056-64.533333 78.912-92.672 101.546666l-5.909333 4.757334-2.837334 0.597333-52.544-14.08 11.114667-20.266667c3.562667-6.485333 7.04-13.013333 10.453333-19.626666 7.04-13.504 17.898667-35.797333 32.597334-66.816a21.290667 21.290667 0 0 0-9.984-28.309334l-3.029334-1.450666a21.333333 21.333333 0 0 0-26.368 6.442666c-33.6 45.013333-64.469333 78.826667-92.608 101.482667l-5.909333 4.757333-2.837333 0.597334-52.138667-13.973334 11.114667-20.266666c3.242667-5.888 6.72-12.416 10.453333-19.626667 6.997333-13.461333 17.962667-35.946667 32.896-67.434667a20.970667 20.970667 0 0 0-10.112-28.010666l-3.328-1.536a21.333333 21.333333 0 0 0-26.069333 6.613333c-33.642667 45.056-64.554667 78.976-92.778667 101.696l-5.909333 4.757333-2.837334 0.597334-32.64-8.746667 11.093334-20.245333c3.541333-6.506667 7.04-13.034667 10.453333-19.626667 6.976-13.482667 17.941333-35.968 32.874667-67.456a21.056 21.056 0 0 0-10.069334-28.074667l-3.242666-1.514666a21.333333 21.333333 0 0 0-26.154667 6.549333z"
					fill="#333333"
					p-id="5252"
				></path>
			</svg>
			<ModelList v-if="showModelList" :modelType="modelType" />
		</header>

		<!-- 聊天内容区 -->
		<chat-content
			:message-list="messageList"
			:prologue-list="prologueList"
			:selected-knowledge="selectedKnowledge"
			:is-finish="isFinish"
			:role-alias="roleAlias"
			:collapse-states="collapseStates"
			@quick-problem="quickProblemHandle"
			@copy-text="copyText"
			@regenerate="regenerateText"
			@stop-generate="stopGenerateText"
			ref="chatContentRef"
		/>

		<!-- 输入区 -->
		<chat-input
			:selected-knowledge="selectedKnowledge"
			:placeholder="placeholder"
			:is-finish="isFinish"
			v-model:message-content="messageContent"
			v-model:is-reasoning-mode="isReasoningMode"
			@send-message="sendOrSave"
			@open-dialog="openDialog"
			@open-audio="audioRef?.openDialog"
			@open-mcp="mcpsRef?.openDialog"
			@file-uploaded="handleFileUpload"
			@image-uploaded="handleImageUpload"
		/>

		<!-- 提示词抽屉 -->
		<prompts-dialog ref="promptsRef" @refresh="selectPrompt">
			<template #title>
				<span class="dark:text-gray-200">提示词</span>
			</template>
		</prompts-dialog>
		<func-dialog ref="funcsRef" @refresh="selectFunc" />
		<table-dialog ref="tablesRef" @refresh="selectTable" />
		<audio-dialog ref="audioRef" @refresh="selectPrompt" />
		<mcps-dialog ref="mcpsRef" @refresh="selectMcps" />
	</div>
</template>

<script setup lang="ts">
import type { ChatMessage, Dataset, FileBase64 } from '../ts/index';
import { parseTime } from '/@/utils/formatTime';
import { useUserInfo } from '/@/stores/userInfo';
import commonFunction from '/@/utils/commonFunction';
import { Local, Session } from '/@/utils/storage';
import { useMessage } from '/@/hooks/message';
import { useEventSource } from '@vueuse/core';
import { initSseConnection, deleteConversation, defaultWelcomeMessage } from '../ts/gpt';
import { generateConversationKey, withMessageThought } from '../ts/message';
import { useDebounceFn } from '@vueuse/core';
import ModelList from './widgets/modelList.vue';
import ChatContent from './chat-content.vue';
import ChatInput from './chat-input.vue';
import { getDetails } from '/@/api/knowledge/aiDataset';

const { copyText } = commonFunction();
const PromptsDialog = defineAsyncComponent(() => import('./prompts.vue'));
const FuncDialog = defineAsyncComponent(() => import('./functions.vue'));
const TableDialog = defineAsyncComponent(() => import('./tables.vue'));
const AudioDialog = defineAsyncComponent(() => import('./widgets/audio.vue'));
const McpsDialog = defineAsyncComponent(() => import('./mcps.vue'));

const props = defineProps({
	knowledgeId: {
		type: String,
		default: '0', // 默认使用自由模式
	},
	showClearButton: {
		type: Boolean,
		default: true,
	},
	showModelList: {
		type: Boolean,
		default: true,
	},
	roleAlias: {
		type: Object,
		default: () => ({ user: useUserInfo().userInfos.user.avatar, assistant: 'AI 助手', system: 'System' }),
	},
	// 允许外部传入知识库对象，如果不传则根据ID查找
	knowledgeData: {
		type: Object as () => Dataset,
		default: undefined,
	},
	functionName: {
		type: String,
		default: '',
	},
});

/**
 * 根据知识库ID获取知识库信息
 * @param {string} knowledgeId - 知识库ID
 * @param {Dataset} knowledgeData - 可选的知识库数据
 * @returns {Dataset} 知识库信息
 */
const getKnowledgeBaseInfo = async (knowledgeId: string, knowledgeData?: Dataset): Promise<Dataset> => {
	let knowledgeBase = knowledgeData ||
		defaultWelcomeMessage.find((k) => k.id === knowledgeId) || { id: knowledgeId, avatarUrl: defaultWelcomeMessage[0].avatarUrl };

	// 确保每个知识库都有时间戳
	if (knowledgeBase.id !== knowledgeId) {
		await getDetails({ id: knowledgeId }).then((res) => {
			knowledgeBase = res.data;
		});
	}

	return knowledgeBase;
};

let messageContent = ref('');
let placeholder = ref('Your message...');
const promptsRef = ref();
const funcsRef = ref();
const tablesRef = ref();
const audioRef = ref();
const mcpsRef = ref();
const chatContentRef = ref();
const functionName = ref(props.functionName);
const messageList = ref<ChatMessage[]>([]);
const collapseStates = ref<{ [key: string]: boolean }>({});
const isFinish = ref(true);
const isReasoningMode = ref(false);
const uploadedFiles = ref<FileBase64[]>([]);
const uploadedImages = ref<FileBase64[]>([]);
const eventSourceRef = ref();
const selectedKnowledge = ref<Dataset>({ id: props.knowledgeId, avatarUrl: '' });
const dataId = ref('');
const mcpId = ref('');
// 根据知识库ID生成会话key
const conversationKey = ref('');

const modelType = computed<('Image' | 'Reason' | 'Chat')[]>(() => {
	switch (selectedKnowledge.value?.id) {
		case '-3':
			return ['Image'];
		case '-7':
			return ['Reason'];
		default:
			return ['Chat'];
	}
});

onMounted(async () => {
	// 初始化知识库信息
	selectedKnowledge.value = await getKnowledgeBaseInfo(props.knowledgeId, props.knowledgeData);
	dataId.value = selectedKnowledge.value?.dataId || '';
	mcpId.value = selectedKnowledge.value?.mcpId || '';

	// 初始化消息历史
	nextTick(() => {
		loadMessageHistory();
	});
});

const loadMessageHistory = () => {
	placeholder.value = selectedKnowledge.value.placeholder || '请输入您的问题';
	messageList.value = JSON.parse(Local.get(conversationKey.value)) || [];
};

// Define stopGenerateText before it's used in the watch function
const stopGenerateText = async () => {
	try {
		eventSourceRef?.value?.value?.close();
	} finally {
		isFinish.value = true; // 确保无论成功或失败都将isFinish设置为true
	}
};

// 当知识库ID变更时，重新加载消息历史
watch(
	() => props.knowledgeId,
	async () => {
		// 如果当前有请求，先停止
		if (eventSourceRef?.value?.value) {
			stopGenerateText();
			isFinish.value = true;
		}
		// 更新会话key
		conversationKey.value = generateConversationKey(props.knowledgeId, true);
				// 查找或使用默认知识库
		selectedKnowledge.value = await getKnowledgeBaseInfo(props.knowledgeId, props.knowledgeData);
		dataId.value = selectedKnowledge.value?.dataId || '';
		mcpId.value = selectedKnowledge.value?.mcpId || '';
		loadMessageHistory();
	},
	{ immediate: true }
);

// Watch for changes in the functionName prop
watch(
	() => props.functionName,
	(newValue) => {
		if (newValue) {
			functionName.value = newValue;
		}
	}
);

// Define a debounced scroll function to prevent too many scroll events
const debouncedScrollToBottom = useDebounceFn(() => {
	if (chatContentRef.value && isFinish.value === false) {
		// Only scroll when actively generating messages
		chatContentRef.value.scrollToBottom();
	}
}, 300); // Increase debounce time to reduce update frequency

const sendChatMessage = async (content: string = messageContent.value) => {
	isFinish.value = false;

	const selectedModel = Local.get(`selectedAiModel:${modelType.value}`);

	const requestMessage: ChatMessage = {
		modelName: selectedModel?.name,
		conversationId: conversationKey.value,
		role: 'user',
		content,
		time: parseTime(new Date()),
		datasetId: selectedKnowledge.value.id,
		extDetails: {
			// @ts-ignore - 使用可能存在的知识库dataId或者本地dataId
			dataId: dataId.value,
			funcName: functionName.value,
			mcpId: mcpId.value,
			files: uploadedFiles.value.length > 0 ? uploadedFiles.value : undefined,
			images: uploadedImages.value.length > 0 ? uploadedImages.value : undefined,
		},
		websearch: selectedKnowledge.value?.id === '-7' && isReasoningMode.value,
	};

	try {
		messageList.value.push(requestMessage);
		clearMessageContent();
		messageList.value.push({
			role: 'assistant',
			content: '',
			// @ts-ignore
			_startThinkTime: Date.now(),
		});

		nextTick(() => {
			debouncedScrollToBottom();
		});

		// 发送消息
		const { data } = await initSseConnection(requestMessage);
		sseMessageSend(data);
	} catch (error: any) {
		appendLastMessageContent({ message: '网络通信超时，请稍后再试' });
		isFinish.value = true;
	}
};

/**
 * 从会话存储中获取访问令牌
 * @returns {string} 访问令牌
 */
const token = computed(() => {
	return Session.getToken();
});

const tenant = computed(() => {
	return Session.getTenant();
});

/**
 * 创建websocket 链接
 */
const sseMessageSend = (messageKey: string) => {
	// baseURL
	const baseURL = import.meta.env.VITE_API_URL;
	const { eventSource, error } = useEventSource(
		`${baseURL}${import.meta.env.VITE_IS_MICRO == 'false' ? '/admin' : '/knowledge'}/chat/msg/list?access_token=${token.value}&TENANT-ID=${
			tenant.value
		}&key=${messageKey}`,
		[],
		{
			autoReconnect: {
				retries: 1,
				delay: 1000,
				onFailed() {
					appendLastMessageContent({ message: '网络通信超时，请稍后再试' });
					isFinish.value = true;
				},
			},
		}
	);

	try {
		eventSourceRef.value = eventSource;
		if (!error.value) {
			let lastScrollTime = 0; // Track last scroll time

			eventSource.value?.addEventListener('message', (result) => {
				let resultData = JSON.parse(result.data);
				if (eventSource.value?.OPEN && resultData.message === '[DONE]') {
					isFinish.value = true;
					eventSource.value?.close();
					Local.set(conversationKey.value, JSON.stringify(messageList.value));
					return;
				}

				if (eventSource.value?.OPEN && resultData.message !== 'pong') {
					appendLastMessageContent(resultData);

					// Only trigger scroll if enough time has passed (throttle scrolling)
					const now = Date.now();
					if (now - lastScrollTime > 500) {
						lastScrollTime = now;
						debouncedScrollToBottom();
					}
				}
			});

			// 添加错误处理监听器
			eventSource.value?.addEventListener('error', () => {
				appendLastMessageContent({ message: '连接已断开，请重试', finish: true });
				isFinish.value = true;
			});
		} else {
			appendLastMessageContent({ message: '网络通信超时，请稍后再试', finish: true });
			isFinish.value = true; // 确保出错时也将isFinish设为true
		}
	} catch (e) {
		appendLastMessageContent({ message: '网络通信超时，请稍后再试', finish: true });
		isFinish.value = true; // 确保出错时也将isFinish设为true
	}
};

const appendLastMessageContent = (result: any) => {
	if (messageList.value.length === 0) return;

	// Create a copy of the last message to avoid direct reactive updates
	const lastMessageIndex = messageList.value.length - 1;
	const lastMessage = messageList.value[lastMessageIndex];

	// Update properties only if result contains valid data
	if (result.message && result.message !== 'null') {
		lastMessage.content = (lastMessage.content || '') + result.message;
	}

	// Only update these properties if they exist in the result
	lastMessage.time = parseTime(new Date());

	if (result.extLinks) {
		lastMessage.extLinks = result.extLinks;
	}

	if (result.path) {
		lastMessage.path = result.path;
	}

	if (result.chartId) {
		lastMessage.chartId = result.chartId;
	}

	if (result.chartType) {
		lastMessage.chartType = result.chartType;
	}

	// Add reasoning content if present and not "null"
	if (result.reasoningContent && result.reasoningContent !== 'null') {
		lastMessage.reasoning_content = (lastMessage.reasoning_content || '') + result.reasoningContent;
	}

	// @ts-ignore - Pass start time to calculate thinking duration
	withMessageThought(lastMessage, lastMessage._startThinkTime);

	// 如果结果中包含finish标志，设置isFinish为true
	if (result.finish) {
		isFinish.value = true;
	}
};

const sendOrSave = async () => {
	if (!messageContent.value.length || !isFinish.value) return;
	await sendChatMessage();
};

const isMdArray = (val: string) => val.match(/^-\s.*/m);
interface PrologueItem {
	type: 'md' | 'question';
	str: string;
	index: number;
}

const prologueList = computed<PrologueItem[]>(() => {
	const lines = selectedKnowledge.value.welcomeMsg?.split('\n');
	if (!lines) return [];

	return lines
		.reduce((pre_array: PrologueItem[], current: string, index: number) => {
			const currentObj = isMdArray(current)
				? {
						type: 'question' as const,
						str: current.replace(/^-\s+/, ''),
						index: index,
				  }
				: {
						type: 'md' as const,
						str: current,
						index: index,
				  };
			if (pre_array.length > 0) {
				const pre = pre_array[pre_array.length - 1];
				if (!isMdArray(current) && pre.type === 'md') {
					pre.str = [pre.str, current].join('\n');
					pre.index = index;
					return pre_array;
				} else {
					pre_array.push(currentObj);
				}
			} else {
				pre_array.push(currentObj);
			}
			return pre_array;
		}, [])
		.sort((pre, next) => pre.index - next.index);
});

function quickProblemHandle(val: string) {
	messageContent.value = val;
	sendChatMessage(val);
}

const openDialog = () => {
	if (selectedKnowledge.value?.id === '0') {
		promptsRef.value.openDialog();
	} else if (selectedKnowledge.value?.id === '-1' || selectedKnowledge.value?.id === '-6') {
		funcsRef.value.openDialog();
	} else if (selectedKnowledge.value?.id === '-2') {
		tablesRef.value.openDialog();
	} else if (selectedKnowledge.value?.id === '-3' || selectedKnowledge.value?.id === '-7' || selectedKnowledge.value?.id === '-8') {
		mcpsRef.value.openDialog();
	}
};

const selectPrompt = (prompt: string) => {
	messageContent.value = prompt;
};

const selectFunc = (func: { showInfo: string; funcName: string }) => {
	const key = generateConversationKey(props.knowledgeId);
	// 调用后台缓存
	deleteConversation(key);
	placeholder.value = func.showInfo;
	functionName.value = func.funcName;

	// 发送
	sendOrSave();
};

/**
 * 选择数据集
 * @param id 表ID
 */
const selectTable = (id: string) => {
	dataId.value = id;
	sendOrSave();
};

const clearMessageContent = () => (messageContent.value = '');

const clearStoreMessageList = () => {
	// 调用后台缓存
	deleteConversation(conversationKey.value);
	Local.remove(conversationKey.value);

	// Close any active event source
	if (eventSourceRef?.value?.value) {
		eventSourceRef.value.value.close();
	}

	// 清空会话但保留知识库配置
	messageList.value = [];
	clearMessageContent();
	isFinish.value = true;

	// 重置上传的文件和图片
	uploadedFiles.value = [];
	uploadedImages.value = [];

	// 重置占位符为知识库默认值
	placeholder.value = selectedKnowledge.value.placeholder || '请输入您的问题';
};

const scrollToBottom = () => {
	debouncedScrollToBottom();
};

const regenerateText = async () => {
	try {
		// 获取messageList 最后一个 role: "assistant" 的消息
		const lastAssistantMessage = messageList.value
			.slice()
			.reverse()
			.find((item) => item.role === 'assistant');
		// 获取messageList 最后一个 role: "user" 的消息
		const lastUserMessage = messageList.value
			.slice()
			.reverse()
			.find((item) => item.role === 'user');
		messageContent.value = lastUserMessage?.content || '';
		// 删除最后一个 role: "assistant" 的消息 和 最后一个 role: "user" 的消息
		messageList.value = messageList.value.filter((item) => item !== lastAssistantMessage && item !== lastUserMessage);
		await sendChatMessage();
		Local.set(conversationKey.value, JSON.stringify(messageList.value));
	} catch (error) {
		useMessage().error('重新生成失败，请稍后再试');
		isFinish.value = true; // 确保出错时也将isFinish设为true
	}
};

/**
 * 处理文件上传
 * @param {FileBase64} fileData - 已转换为base64的文件数据
 */
const handleFileUpload = (fileData: FileBase64) => {
	uploadedFiles.value = [fileData];
};

/**
 * 处理图片上传
 * @param {FileBase64} imageData - 已转换为base64的图片数据
 */
const handleImageUpload = (imageData: FileBase64) => {
	// 直接保存转换好的base64图片数据
	uploadedImages.value = [imageData];
};

const selectMcps = (mcp: { mcpId: string; mcpName: string }) => {
	// Optionally add the MCP name to the message content
	placeholder.value = `使用 MCP: ${mcp.mcpName}`;
	mcpId.value = mcp.mcpId;
};

// 对外暴露方法
defineExpose({
	sendChatMessage,
	clearStoreMessageList,
	regenerateText,
	stopGenerateText,
	scrollToBottom,
	setConversationId: (conversationId: string) => {
		// Since conversationKey is now a computed property, we should store the conversationId in a ref
		// that can be used to load the specific conversation history
		const customConversationId = ref(conversationId);
		messageList.value = JSON.parse(Local.get(customConversationId.value)) || [];
	},
	getMessages: () => messageList.value,
	getSelectedKnowledge: () => selectedKnowledge.value,
});
</script>
