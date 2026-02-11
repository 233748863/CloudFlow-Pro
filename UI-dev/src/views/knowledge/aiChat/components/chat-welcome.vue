<template>
	<div class="chat chat-start">
		<div class="chat-image avatar">
			<div v-if="selectedKnowledge?.avatarUrl.includes('svg')" v-html="selectedKnowledge?.avatarUrl"></div>
			<div class="w-[40px] h-[40px] rounded-full overflow-hidden shadow-sm" v-else>
				<img :src="baseURL + selectedKnowledge.avatarUrl" class="object-cover w-full h-full" />
			</div>
		</div>
		<div class="w-full bg-white rounded-lg border-gray-100 dark:border-gray-700 dark:bg-gray-800">
			<div class="flex flex-col flex-1 md:mb-auto">
				<div v-for="(item, index) in prologueList" :key="index" class="animate-fadeIn">
					<span v-if="item.type === 'md' && item.str" class="flex items-center mb-4 text-xl font-bold text-gray-800 dark:text-gray-200">
						<MdRenderer :source="item.str" class="w-full" />
					</span>
					<ul v-if="item.type === 'question' && item.str" class="flex flex-col gap-3 mb-2 w-full">
						<li
							class="p-4 w-full text-gray-700 bg-gray-50 rounded-lg border border-gray-200 transition-all duration-200 cursor-pointer hover:shadow-md dark:text-gray-300 dark:bg-gray-700 dark:border-gray-600 hover:border-blue-300 dark:hover:border-blue-500 hover:bg-gray-100 dark:hover:bg-gray-600"
							@click="quickProblemHandle(item.str)"
						>
							<div class="flex items-center">
								<el-icon class="mr-3 text-blue-500 dark:text-blue-400">
									<EditPen />
								</el-icon>
								<span class="font-medium">{{ item.str }}</span>
							</div>
						</li>
					</ul>
				</div>
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
import { EditPen } from '@element-plus/icons-vue';
import MdRenderer from '/@/components/MdRenderer/MdRenderer.vue';
import type { Dataset } from '../ts/index';

// Define PrologueItem interface
interface PrologueItem {
	type: 'md' | 'question';
	str: string;
	index: number;
}

const props = defineProps({
	selectedKnowledge: {
		type: Object as () => Dataset,
		required: true,
	},
	prologueList: {
		type: Array as () => PrologueItem[],
		required: true,
	}
});

const emit = defineEmits(['quickProblem']);

const quickProblemHandle = (val: string) => {
	emit('quickProblem', val);
};
</script>
