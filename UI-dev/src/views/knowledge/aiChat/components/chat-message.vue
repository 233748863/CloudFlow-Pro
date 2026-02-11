<template>
	<div class="flex flex-col py-3 rounded-lg group">
		<template v-if="(message.role as string) === 'assistant'">
			<!-- Assistant message -->
			<div class="relative chat chat-start" v-if="message.content || message.reasoning_content">
				<div class="chat-image avatar">
					<div v-if="selectedKnowledge?.avatarUrl?.includes('svg')" v-html="selectedKnowledge?.avatarUrl"></div>
					<div class="w-[40px] h-[40px] rounded-full overflow-hidden" v-else>
						<img :src="baseURL + (selectedKnowledge?.avatarUrl || '')" class="object-cover w-full h-full" />
					</div>
				</div>
				<div class="flex items-center mb-1 ml-6 space-x-2 chat-header">
					<span class="font-medium text-gray-800 dark:text-gray-200">AI 助手</span>
					<time class="text-xs opacity-70">{{ message.time }}</time>
					<div class="flex items-center space-x-1">
						<el-button
							@click="handleCopyText(message.content)"
							class="!p-1 h-6"
							text
							icon="CopyDocument"
							v-if="message.content"
							type="primary"
						></el-button>
						<audio-player
							ref="audioPlayerRef"
							:text="message.content"
							v-if="message === messageList[messageList.length - 1] && message.content && messageList.length > 1"
						/>
						<el-button
							@click="handleRegenerate()"
							class="!p-1 h-6"
							text
							icon="Refresh"
							v-if="message === messageList[messageList.length - 1] && message.content && messageList.length > 1"
							type="primary"
						></el-button>
					</div>
				</div>
				<div class="max-w-3xl bg-white rounded-lg dark:bg-gray-800 dark:border-gray-700">
					<div class="flex flex-col gap-3 p-4" :class="{ 'md:flex-row': message.content && message.chartId && isWideScreen }">
						<!-- Reasoning content collapsible panel -->
						<div
							v-if="message.reasoning_content"
							:class="[
								'bg-gray-50 rounded-lg border border-gray-200 collapse collapse-arrow dark:bg-gray-800 dark:border-gray-700',
								collapseStates[message.time || ''] === false ? 'collapse-close' : 'collapse-open',
							]"
						>
							<input type="checkbox" class="peer" @change="collapseStates[message.time || ''] = !collapseStates[message.time || '']" />
							<div
								class="text-sm font-medium text-gray-700 collapse-title dark:text-gray-300 peer-checked:bg-gray-100 dark:peer-checked:bg-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-700/50"
							>
								<div class="flex gap-2 items-center">
									<svg
										xmlns="http://www.w3.org/2000/svg"
										class="w-4 h-4 text-gray-500 dark:text-gray-400"
										fill="none"
										viewBox="0 0 24 24"
										stroke="currentColor"
									>
										<path
											stroke-linecap="round"
											stroke-linejoin="round"
											stroke-width="2"
											d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
										/>
									</svg>
									已深度思考（用时 {{ message.thinking_time || '0' }} 秒）
								</div>
							</div>
							<div class="collapse-content bg-gray-50/50 dark:bg-gray-800/50 peer-checked:bg-gray-100 dark:peer-checked:bg-gray-700/50">
								<div class="pt-4 text-gray-600 whitespace-pre-wrap dark:text-gray-300">
									{{ message.reasoning_content }}
								</div>
							</div>
						</div>
						<!-- Main content -->
						<div
							ref="contentContainer"
							class="relative text-gray-800 dark:text-gray-200"
							v-if="message.content"
							:class="{ 'md:flex-1 md:max-w-[60%]': message.chartId && isWideScreen }"
						>
							<MdRenderer v-if="selectedKnowledge.id !== '-4'" :source="message.content" class="w-full" />
							<MindMap v-else :text="message.content" :id="message.time || ''" />
							<router-link
								v-if="message.path"
								:to="message.path"
								class="inline-flex absolute top-1 right-1 items-center text-sm text-blue-600 transition-colors duration-200 shrink-0 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
							>
								<svg xmlns="http://www.w3.org/2000/svg" class="mr-1 w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
									/>
								</svg>
								一键跳转
							</router-link>
						</div>

						<!-- Chart display for chartId messages -->
						<div
							v-if="message.chartId"
							class="overflow-hidden relative flex-1 mt-6 w-full bg-white rounded-lg border border-gray-200 shadow-sm dark:bg-gray-800 dark:border-gray-700 chart-container"
							:class="{ 'md:mt-0 md:min-w-[500px] md:max-w-[40%]': message.content && isWideScreen }"
							style="min-height: 300px; height: 50vh; max-height: 500px"
						>
							<!-- 图表标题栏 -->
							<div class="flex justify-between items-center p-3 border-b border-gray-200 dark:border-gray-700">
								<div class="flex items-center">
									<svg xmlns="http://www.w3.org/2000/svg" class="mr-2 w-5 h-5 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
										<path
											stroke-linecap="round"
											stroke-linejoin="round"
											stroke-width="2"
											d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
										/>
									</svg>
									<span class="font-medium text-gray-700 dark:text-gray-300">数据可视化</span>
								</div>
							</div>

							<!-- 图表内容 -->
							<div class="p-3 h-[calc(100%-48px)]">
								<v-chart v-if="chartOption" class="w-[500px] h-full" :option="chartOption" autoresize />

								<!-- 图表加载状态 -->
								<div v-else class="flex justify-center items-center h-full">
									<div class="flex flex-col items-center">
										<span class="mb-2 text-gray-600 dark:text-gray-300">图表加载中...</span>
										<div class="flex space-x-2">
											<span class="text-blue-500 loading loading-spinner loading-md"></span>
										</div>
									</div>
								</div>
							</div>
						</div>
					</div>
				</div>

				<div
					class="flex gap-2 items-center ml-6 chat-footer"
					v-if="
						(message.extLinks && message.extLinks.length > 0) ||
						(message === messageList[messageList.length - 1] && messageList.length > 1 && !isFinish)
					"
				>
					<!-- Stop button -->
					<el-button
						v-if="message === messageList[messageList.length - 1] && messageList.length > 1 && !isFinish"
						@click="handleStopGenerate()"
						text
						icon="VideoPause"
						type="primary"
						class="!bg-white dark:!bg-gray-700 !shadow-md !rounded-full !p-2"
					></el-button>

					<!-- Reference materials -->
					<div v-if="message.extLinks && message.extLinks.length > 0" class="flex-1 px-3 rounded-md dark:bg-gray-700/40">
						<div class="flex flex-wrap gap-2 items-center text-xs">
							<span class="font-medium text-gray-600 dark:text-gray-300">参考资料</span>
							<div class="flex flex-wrap gap-1.5">
								<el-tag
									v-for="(link, linkIndex) in message.extLinks"
									:key="linkIndex"
									size="small"
									effect="plain"
									class="!border-0 !bg-gray-100 dark:!bg-gray-600 !text-gray-700 dark:!text-gray-300"
								>
									{{ link.name }}
								</el-tag>
							</div>

							<!-- Rating -->
							<div v-if="message.extLinks[0].distance" class="flex items-center ml-auto space-x-1">
								<div class="tooltip tooltip-left" :data-tip="`相关度: ${Number(message.extLinks[0].distance).toFixed(2)}`">
									<div class="rating rating-xs">
										<input
											v-for="n in 5"
											:key="n"
											type="radio"
											:name="'rating' + index"
											class="mask mask-star-2 bg-blue-400/80 dark:bg-blue-500/80"
											:checked="Math.round(message.extLinks[0].distance * 5) === n"
											disabled
										/>
									</div>
								</div>
							</div>
						</div>
					</div>
				</div>
			</div>

			<!-- Loading indicator for LLM responses -->
			<div class="flex" v-if="!message.content && !message.reasoning_content">
				<div class="flex justify-center items-center mt-2 ml-12 text-center">
					<span class="mx-0.5 loading loading-ball loading-xs dark:bg-blue-500"></span>
					<span class="mx-0.5 loading loading-ball loading-sm dark:bg-blue-500"></span>
					<span class="mx-0.5 loading loading-ball loading-md dark:bg-blue-500"></span>
					<span class="mx-0.5 loading loading-ball loading-lg dark:bg-blue-500"></span>
				</div>
			</div>
		</template>

		<template v-else-if="(message.role as string) === 'user'">
			<!-- User message -->
			<div class="chat chat-end">
				<div class="chat-image avatar">
					<div class="w-[40px] h-[40px] rounded-full overflow-hidden">
						<img alt="User avatar" :src="baseURL + roleAlias[message.role]" class="object-cover w-full h-full" />
					</div>
				</div>
				<div class="flex justify-end items-center mb-1 space-x-2 chat-header">
					<time class="text-xs opacity-70">{{ message.time }}</time>
					<span class="font-medium text-gray-800 dark:text-gray-200">{{ userInfos.user.username }}</span>
				</div>
				<div class="max-w-3xl bg-white rounded-lg dark:bg-gray-800 dark:border-gray-700">
					<div class="p-4 text-gray-800 dark:text-gray-200">
						<MdRenderer v-if="message.content" :source="message.content || ''" class="w-full" />
					</div>
				</div>
			</div>
		</template>
	</div>
</template>

<script setup lang="ts">
import { ref, watch, onUnmounted } from 'vue';
import { storeToRefs } from 'pinia';
import MdRenderer from '/@/components/MdRenderer/MdRenderer.vue';
import MindMap from '/@/components/MindMap/index.vue';
import AudioPlayer from './widgets/audio-player.vue';
import VChart from 'vue-echarts';
import { useIntervalFn, useMediaQuery } from '@vueuse/core';
import type { ChatMessage, Dataset } from '../ts/index';
import { useUserInfo } from '/@/stores/userInfo';
import { getChartData } from '../ts/gpt';

import { use } from 'echarts/core';
import { BarChart } from 'echarts/charts';
import { LineChart } from 'echarts/charts';
import { PieChart } from 'echarts/charts';
import { GridComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';

use([GridComponent, BarChart, LineChart, PieChart, CanvasRenderer]);

const stores = useUserInfo();
const { userInfos } = storeToRefs(stores);
const baseURL = import.meta.env.VITE_API_URL || '';

const props = defineProps({
	message: {
		type: Object as () => ChatMessage,
		required: true,
	},
	index: {
		type: Number,
		required: true,
	},
	selectedKnowledge: {
		type: Object as () => Dataset,
		required: true,
	},
	messageList: {
		type: Array as () => ChatMessage[],
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

const emit = defineEmits(['copyText', 'regenerate', 'stopGenerate']);
const audioPlayerRef = ref();
const chartOption = ref(null);
const isPolling = ref(false); // 是否正在轮询中
const isWideScreen = ref(useMediaQuery('(min-width: 1024px)')); // 判断是否为宽屏
const pollAttempts = ref(0); // 轮询尝试次数计数器

// Make content and chart display side by side on wide screens
// 使内容和图表在宽屏上并排显示
const contentContainer = ref<HTMLElement | null>(null);

// Function to fetch chart data
// 获取图表数据的函数
const fetchChartData = async (chartId: string) => {
	try {
		const { data } = await getChartData(chartId);
		if (data) {
			chartOption.value = JSON.parse(data);

			// 如果成功获取到有效数据，停止轮询
			if (chartOption.value) {
				isPolling.value = false;
				pause();
			}
		}
	} catch (error) {
		// 静默处理错误
	}

	// 限制最多轮询10次
	pollAttempts.value++;
	if (pollAttempts.value >= 10) {
		isPolling.value = false;
		pause(); // 达到最大轮询次数后停止
	}
};

// Setup interval to poll for chart data
// 设置轮询图表数据的定时器
const { pause, resume } = useIntervalFn(
	() => {
		if (props.message.chartId) {
			fetchChartData(props.message.chartId);
		}
	},
	2000, // Poll every 2 seconds 每2秒轮询一次
	{ immediate: false, immediateCallback: false }
);

// Watch for chartId changes to start/stop polling
// 监听chartId变化以开始/停止轮询
watch(
	() => props.message.chartId,
	(newChartId) => {
		if (newChartId && !isPolling.value) {
			isPolling.value = true;
			pollAttempts.value = 0; // 重置计数器
			// Fetch immediately and then start polling
			// 立即获取数据然后开始轮询
			fetchChartData(newChartId);
			resume();
		} else if (!newChartId && isPolling.value) {
			isPolling.value = false;
			pause(); // 当没有chartId时停止轮询
		}
	},
	{ immediate: true } // 立即执行
);

// Stop polling when component is unmounted
// 组件卸载时停止轮询
onUnmounted(() => {
	pause();
});

const handleCopyText = (content: string) => {
	emit('copyText', content);
};

const handleRegenerate = () => {
	emit('regenerate');
};

const handleStopGenerate = () => {
	// 停止生成的同时也停止轮询
	if (isPolling.value) {
		isPolling.value = false;
		pause();
	}
	emit('stopGenerate');
};
</script>
