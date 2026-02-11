<template>
	<div class="flex flex-col chat-content-container">
		<div ref="scrollContainerRef" class="overflow-auto flex-grow scroll-container">
			<div class="flex-1 mx-4 mb-4" ref="chatListDom">
				<!-- Welcome area -->
				<div class="flex flex-col py-4 rounded-lg group">
					<chat-welcome
						v-if="selectedKnowledge.welcomeMsg"
						:selected-knowledge="selectedKnowledge"
						:prologue-list="prologueList"
						@quick-problem="quickProblemHandle"
					/>

					<!-- Chat messages -->
					<chat-message
						v-for="(item, index) in filteredMessageList"
						:key="index"
						:message="item"
						:index="index"
						:selected-knowledge="selectedKnowledge"
						:message-list="messageList"
						:is-finish="isFinish"
						:baseURL="baseURL"
						:role-alias="roleAlias"
						:collapse-states="collapseStates"
						@copy-text="copyText"
						@regenerate="regenerateText"
						@stop-generate="stopGenerateText"
						ref="chatMessageRef"
					/>
				</div>
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
import { useScroll } from '@vueuse/core';
import ChatWelcome from './chat-welcome.vue';
import ChatMessage from './chat-message.vue';
import type { ChatMessage as MessageType, Dataset } from '../ts/index';

// Define PrologueItem interface
interface PrologueItem {
	type: 'md' | 'question';
	str: string;
	index: number;
}

const props = defineProps({
	messageList: {
		type: Array as () => MessageType[],
		required: true,
	},
	prologueList: {
		type: Array as () => PrologueItem[],
		required: true,
	},
	selectedKnowledge: {
		type: Object as () => Dataset,
		required: true,
	},
	isFinish: {
		type: Boolean,
		default: true,
	},
	roleAlias: {
		type: Object,
		required: true,
	},
	collapseStates: {
		type: Object,
		required: true,
	},
});

const emit = defineEmits(['quickProblem', 'copyText', 'regenerate', 'stopGenerate', 'scrollToBottom']);

const scrollContainerRef = ref<HTMLElement | null>(null);
const chatListDom = ref<HTMLDivElement>();
const chatMessageRef = ref();

const baseURL = import.meta.env.VITE_APP_BASE_API;

// 使用VueUse的useScroll来监听和控制滚动
useScroll(scrollContainerRef, {
	behavior: 'smooth',
	onScroll: () => {
		// 可以在这里添加额外的滚动处理逻辑
	},
});

// Computed property to filter message list and prevent recursive updates
const filteredMessageList = computed(() => {
	return props.messageList.filter((item) => item !== undefined && item !== null);
});

// Pass through events to parent
const quickProblemHandle = (val: string) => {
	emit('quickProblem', val);
};

const copyText = (content: string) => {
	emit('copyText', content);
};

const regenerateText = () => {
	emit('regenerate');
};

const stopGenerateText = () => {
	emit('stopGenerate');
};

// 使用VueUse的useScroll来滚动到底部
const scrollToBottom = () => {
	nextTick(() => {
		if (!scrollContainerRef.value) return;

		// 计算需要滚动到的位置 - 内容高度
		const scrollHeight = scrollContainerRef.value.scrollHeight;

		// 使用VueUse的useScroll滚动到底部
		scrollContainerRef.value.scrollTop = scrollHeight;
	});
};

onMounted(() => {
	// 等待DOM完全渲染后滚动到底部
	nextTick(() => {
		scrollToBottom();
	});
});

// 监听消息列表长度变化，当有新消息时滚动到底部
watch(
	() => props.messageList.length,
	(newLength, oldLength) => {
		if (newLength > oldLength) {
			// 新消息添加 - 始终滚动到底部
			scrollToBottom();
		}
	}
);

// 将scrollToBottom方法暴露给父组件
defineExpose({
	scrollToBottom,
});
</script>

<style scoped>
.flex-grow {
	flex-grow: 1;
}

.chat-content-container {
	/* 设置适当的高度，为输入区域留出空间 */
	height: calc(100vh - 120px);
	overflow: hidden;
}

.scroll-container {
	height: 100%;
	overflow-y: auto;
	scrollbar-width: thin;
	scrollbar-color: rgba(155, 155, 155, 0.5) transparent;
}

.scroll-container::-webkit-scrollbar {
	width: 6px;
}

.scroll-container::-webkit-scrollbar-track {
	background: transparent;
}

.scroll-container::-webkit-scrollbar-thumb {
	background-color: rgba(155, 155, 155, 0.5);
	border-radius: 3px;
}
</style>
