<template>
	<div class="overflow-y-auto h-[90vh] p-3 mb-9 pb-20">
		<div
			v-for="knowledge in defaultWelcomeMessage"
			:key="knowledge.id"
			@click="selectKnowledge(knowledge)"
			:class="{
				'bg-blue-50 dark:bg-blue-900 border-l-4 border-blue-500': selectedKnowledge?.id === knowledge.id,
				'hover:bg-gray-100 dark:hover:bg-gray-700': selectedKnowledge?.id !== knowledge.id,
			}"
			class="flex items-center p-2 mb-4 rounded-md cursor-pointer"
		>
			<div class="mr-3 w-12 h-12 bg-gray-300 rounded-full dark:bg-gray-600">
				<div v-html="knowledge.avatarUrl" />
			</div>
			<div class="flex-1">
				<h2 class="text-base font-black dark:text-gray-200">{{ knowledge.name }}</h2>
				<p class="text-gray-400 dark:text-gray-500">{{ knowledge.description }}</p>
			</div>
		</div>

		<div
			@click="selectKnowledge(knowledge)"
			v-for="knowledge in knowledges"
			:key="knowledge.id"
			:class="{
				'bg-blue-50 dark:bg-blue-900 border-l-4 border-blue-500': selectedKnowledge?.id === knowledge.id,
				'hover:bg-gray-100 dark:hover:bg-gray-700': selectedKnowledge?.id !== knowledge.id,
			}"
			class="flex items-center p-2 mb-4 rounded-md cursor-pointer"
		>
			<div class="mr-3 w-12 h-12 bg-gray-300 rounded-full dark:bg-gray-600">
				<img :src="baseURL + knowledge.avatarUrl" alt="User Avatar" class="w-12 h-12 rounded-full" />
			</div>
			<div class="flex-1">
				<h2 class="text-base font-black dark:text-gray-200">{{ knowledge.name }}</h2>
				<p class="text-gray-400 dark:text-gray-500">{{ knowledge.description }}</p>
			</div>
		</div>
	</div>
</template>
<script setup lang="ts" name="AiPromptsDialog">
import { fetchDataList } from '/@/api/knowledge/aiDataset';
import type { Dataset } from '/@/views/knowledge/aiChat/ts';
import { defaultWelcomeMessage } from '/@/views/knowledge/aiChat/ts/gpt';

const emit = defineEmits(['refresh']);

// Accept initialKnowledgeId as prop
const props = defineProps({
	initialKnowledgeId: {
		type: String,
		default: '0',
	},
});

const knowledges = ref<Dataset[]>([]);
// 默认选择第一个【自由模式】或根据props初始化
const selectedKnowledge = ref<Dataset>(defaultWelcomeMessage[0]);

const selectKnowledge = (knowledge: Dataset) => {
	selectedKnowledge.value = knowledge;
	emit('refresh', knowledge);
};

// Initialize the selected knowledge based on the ID
const initializeSelectedKnowledge = (knowledgeId: string) => {
	// Find in default welcome messages
	const knowledge = defaultWelcomeMessage.find((item) => item.id === knowledgeId);
	if (knowledge) {
		selectedKnowledge.value = knowledge;
		// Also emit the refresh event to update the parent component
		emit('refresh', knowledge);
	}
};

const fetchKnowledges = async () => {
	const { data } = await fetchDataList();
	knowledges.value = data;
};

onMounted(() => {
	fetchKnowledges();

	// Set initial selection based on props
	if (props.initialKnowledgeId !== '0') {
		initializeSelectedKnowledge(props.initialKnowledgeId);
	}
});

// Watch for changes to the initialKnowledgeId prop
watch(
	() => props.initialKnowledgeId,
	(newValue) => {
		if (newValue && newValue !== '0') {
			initializeSelectedKnowledge(newValue);
		}
	},
	{ immediate: true }
);
</script>
