<template>
	<!-- 侧边栏容器 -->
	<div class="flex-none w-72 bg-white border-r border-gray-300 dark:bg-gray-800 dark:border-gray-700">
		<!-- 带有新建聊天按钮的头部 -->
		<div class="flex justify-between items-center p-4 border-b border-gray-300 dark:border-gray-700">
			<button @click="createNewChat" class="flex items-center space-x-2 text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white">
				<svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
				</svg>
				<span>新建聊天</span>
			</button>
			<button @click="clearAllChats" class="flex items-center text-sm text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300">
				<svg xmlns="http://www.w3.org/2000/svg" class="mr-1 w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
					/>
				</svg>
			</button>
		</div>

		<!-- 聊天历史列表 -->
		<div class="overflow-y-auto overflow-x-hidden p-2 max-h-screen">
			<div v-if="recentConversations.length === 0" class="py-4 text-center text-gray-500">暂无历史记录</div>
			<div
				v-for="conversation in recentConversations"
				:key="conversation.conversationId"
				class="flex justify-between items-start p-3 mb-2 w-full rounded-md cursor-pointer group hover:bg-gray-100 dark:hover:bg-gray-700"
			>
				<div @click="handleConversationClick(conversation.conversationId)" class="flex flex-1 items-start space-x-2 w-[85%] overflow-hidden">
					<div class="overflow-hidden w-full">
						<p class="text-sm font-medium text-gray-900 truncate whitespace-nowrap dark:text-white">
							{{ conversation.title }}
						</p>
						<p v-if="conversation.time" class="text-xs text-gray-500 truncate dark:text-gray-400">{{ conversation.time }}</p>
					</div>
				</div>
				<button
					@click.stop="deleteChat(conversation.conversationId)"
					class="hidden ml-2 text-gray-400 group-hover:block hover:text-red-500 dark:text-gray-500 dark:hover:text-red-400"
				>
					<svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
					</svg>
				</button>
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
import type { ChatMessage } from '../ts/index';
import { useRouter } from 'vue-router';
import { Local } from '/@/utils/storage';
import { useUserInfo } from '/@/stores/userInfo';
import { generateConversationKey } from '../ts/message';
import { ElMessageBox } from 'element-plus';

// 定义对话接口
interface Conversation {
	conversationId: string; // 对话ID
	title: string; // 对话标题
	time?: string; // 对话时间
	datasetId: string; // 知识库ID
}

// 组件属性定义
const props = defineProps({
	knowledgeId: {
		type: String,
		required: true, // 必需的知识库ID
	},
});

// 定义组件事件
const emit = defineEmits(['conversation-selected']);

const router = useRouter();
// 最近对话列表
const recentConversations = ref<Conversation[]>([]);

// 从本地存储加载最近对话
const loadRecentConversations = () => {
	// 基于知识库ID和用户ID生成存储键前缀
	const baseKey = `chat-${props.knowledgeId}-${useUserInfo().userInfos.user.userId}`;
	// 查找所有匹配模式的键
	const allKeys = Object.keys(localStorage).filter((key) => key.includes(baseKey));

	if (allKeys.length > 0) {
		// 获取对话数据
		const conversations: Conversation[] = [];

		for (const key of allKeys) {
			const storedData = Local.get(key);
			if (storedData) {
				try {
					const parsedData = JSON.parse(storedData);
					if (parsedData && Array.isArray(parsedData) && parsedData.length > 0) {
						// 找到第一条用户消息作为标题
						const userMessage = parsedData.find((m: ChatMessage) => m.role === 'user');
						if (userMessage) {
							conversations.push({
								conversationId: key,
								title: userMessage.content,
								time: userMessage.time,
								datasetId: props.knowledgeId,
							});
						}
					}
				} catch (e) {
					// 忽略解析错误
				}
			}
		}

		// 按时间戳排序（最新的在前）
		conversations.sort((a: Conversation, b: Conversation) => {
			const timeA = a.time ? new Date(a.time).getTime() : 0;
			const timeB = b.time ? new Date(b.time).getTime() : 0;
			return timeB - timeA;
		});

		// 只保留10个最近的对话，删除其余的
		if (conversations.length > 10) {
			const conversationsToKeep = conversations.slice(0, 10);
			const conversationsToDelete = conversations.slice(10);

			// 从本地存储中删除较旧的对话
			conversationsToDelete.forEach((conversation: Conversation) => {
				Local.remove(conversation.conversationId);
			});

			recentConversations.value = conversationsToKeep;
		} else {
			recentConversations.value = conversations;
		}
	} else {
		recentConversations.value = [];
	}
};

// 处理对话点击事件
const handleConversationClick = (conversationId: string) => {
	emit('conversation-selected', conversationId);
};

// 删除特定聊天记录
const deleteChat = async (conversationId: string) => {
	if (conversationId) {
		try {
			// 确认删除提示
			await ElMessageBox.confirm('确定要删除该聊天记录吗？', '提示', {
				confirmButtonText: '确定',
				cancelButtonText: '取消',
				type: 'warning',
			});

			// 从本地存储中移除
			Local.remove(conversationId);

			// 从显示列表中移除
			recentConversations.value = recentConversations.value.filter((conv) => conv.conversationId !== conversationId);

			// 如果这是当前选中的对话，创建一个新的
			emit('conversation-selected', '');
		} catch {
			// 用户取消操作
		}
	}
};

// 清空所有聊天记录
const clearAllChats = async () => {
	try {
		// 确认清空提示
		await ElMessageBox.confirm('确定要清空所有聊天记录吗？此操作不可撤销。', '警告', {
			confirmButtonText: '确定',
			cancelButtonText: '取消',
			type: 'warning',
		});

		// 获取此知识库的基本键模式
		const baseKey = `chat-${props.knowledgeId}-${useUserInfo().userInfos.user.userId}`;

		// 查找所有匹配的键
		const allKeys = Object.keys(localStorage).filter((key) => key.includes(baseKey));

		// 逐个移除
		for (const key of allKeys) {
			Local.remove(key);
		}

		// 清空显示列表
		recentConversations.value = [];

		// 创建新对话
		createNewChat();
	} catch {
		// 用户取消操作
	}
};

// 创建新聊天，同时保留必要的查询参数
const createNewChat = () => {
	// 获取当前路由
	const currentRoute = router.currentRoute.value;

	// 格式化当前日期和时间作为标题
	const now = new Date();
	const dateStr = now.toLocaleDateString();
	const timeStr = now.toLocaleTimeString();
	const chatTitle = `新对话 (${dateStr} ${timeStr})`;
	const conversationId = generateConversationKey(props.knowledgeId);

	// 添加到最近对话列表
	const newConversation: Conversation = {
		conversationId: conversationId,
		title: chatTitle,
		time: now.toLocaleString(),
		datasetId: props.knowledgeId,
	};

	recentConversations.value = [newConversation, ...recentConversations.value];

	// 发送对话ID
	emit('conversation-selected', conversationId);

	// 构建查询参数
	const query: Record<string, any> = {
		datasetId: props.knowledgeId,
		_t: Date.now(), // 时间戳防止缓存
	};

	// 保留原有的dataId参数（如果存在）
	if (currentRoute.query.dataId) {
		query.dataId = currentRoute.query.dataId;
	}

	// 保留原有的datasetName参数（如果存在）
	if (currentRoute.query.datasetName) {
		query.datasetName = currentRoute.query.datasetName;
	}
};

// 组件挂载时初始加载
onMounted(() => {
	loadRecentConversations();
});

// 监听知识库ID变化以重新加载消息
watch(() => props.knowledgeId, loadRecentConversations);
</script>
