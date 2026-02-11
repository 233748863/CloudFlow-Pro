<template>
	<div class="layout-padding">
		<div class="layout-padding-auto layout-padding-view">
			<div class="flex overflow-hidden h-screen">
				<!-- Left sidebar (only shown when no datasetId in URL) -->
				<div v-if="!isDirectChat" class="w-1/4 bg-white border-r border-gray-300 dark:bg-gray-800 dark:border-gray-700">
					<knowlegeslist @refresh="selectKnowledge" :initial-knowledge-id="selectedKnowledgeId" />
				</div>

				<!-- When direct chat mode, use the chat history sidebar component -->
				<chat-history-sidebar v-else :knowledge-id="selectedKnowledgeId" @conversation-selected="loadMessage" />

				<!-- Right chat window -->
				<div class="flex-1" :class="{ 'w-full': !isDirectChat, 'flex-1': isDirectChat }">
					<chat-window ref="chatWindowRef" :knowledge-id="selectedKnowledgeId" :knowledge-data="selectedKnowledge" />
				</div>
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
import type { Dataset } from './ts/index';
import { defaultWelcomeMessage } from './ts/gpt';
import knowlegeslist from './components/knowleges.vue';
import ChatWindow from './components/chat-window.vue';
import ChatHistorySidebar from './components/chat-history-sidebar.vue';
import { useRoute } from 'vue-router';
import { ref, watch, nextTick, onBeforeMount } from 'vue';

// Define props
const props = defineProps({
	datasetId: {
		type: String,
		default: '',
	},
	mcpId: {
		type: String,
		default: '',
	},
});

// Get route to access query parameters
const route = useRoute();

// Selected knowledge
const selectedKnowledgeId = ref('0');
const selectedKnowledge = ref<Dataset>(defaultWelcomeMessage[0]);
const chatWindowRef = ref();

// Direct chat mode state
const isDirectChat = ref(false);

// Load a specific message
const loadMessage = (conversationId: string) => {
	if (chatWindowRef.value) {
		chatWindowRef.value.setConversationId(conversationId);
	}
};

// Handle knowledge selection from the sidebar
const selectKnowledge = (knowledge: Dataset) => {
	selectedKnowledgeId.value = knowledge.id;
	selectedKnowledge.value = knowledge;
};

// Check if there are query parameters to auto-select a knowledge dataset
onBeforeMount(() => {
	// Check for datasetId from URL first
	if (props.datasetId && props.datasetId !== '') {
		// Try to find matching dataset or handle it as needed
		const dataset = defaultWelcomeMessage.find((item) => item.id === props.datasetId);

		if (dataset) {
			selectedKnowledgeId.value = props.datasetId;
			selectedKnowledge.value = dataset;
			isDirectChat.value = true;
		}
	}
	// If no datasetId in path, check for query parameters as before
	else if (route.query.datasetId) {
		// Find the dataset in the default welcome messages
		const datasetId = route.query.datasetId as string;
		const dataset = defaultWelcomeMessage.find((item) => item.id === datasetId);

		isDirectChat.value = true;

		if (dataset) {
			// If we have additional data from aiData page
			if (route.query.dataId || route.query.mcpId) {
				const enhancedDataset = {
					...dataset,
					dataId: route.query.dataId as string,
					mcpId: props.mcpId || (route.query.mcpId as string) || '',
				};
				selectedKnowledgeId.value = datasetId;
				selectedKnowledge.value = enhancedDataset;
			} else {
				// Just select the dataset
				selectedKnowledgeId.value = datasetId;
				selectedKnowledge.value = dataset;
			}
		} else {
			selectedKnowledgeId.value = datasetId;
		}
	}
});

// Reset chat for a new conversation while preserving dataset configuration
const resetChat = () => {
	if (chatWindowRef.value) {
		chatWindowRef.value.clearStoreMessageList();
		// Ensure the chat window is scrolled to the starting position
		nextTick(() => {
			if (chatWindowRef.value) {
				chatWindowRef.value.scrollToBottom();
			}
		});
	}
};

// Watch for changes in the route to handle new chat creation
watch(
	() => route.query._t,
	(newTimestamp, oldTimestamp) => {
		if (newTimestamp && newTimestamp !== oldTimestamp) {
			resetChat();
		}
	}
);
</script>
