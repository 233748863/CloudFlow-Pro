<template>
	<div ref="containerRef" class="ai-md md-container"></div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, watch } from 'vue';
import Cherry from 'cherry-markdown';
import 'cherry-markdown/dist/cherry-markdown.min.css';
import { useThemeConfig } from '/@/stores/themeConfig';
import { storeToRefs } from 'pinia';
import type { CherryOptions } from 'cherry-markdown/types/cherry';

// 获取主题配置
const storesThemeConfig = useThemeConfig();
const { themeConfig } = storeToRefs(storesThemeConfig);

// 获取布局配置信息
const getThemeConfig = computed(() => {
	return themeConfig.value;
});

const props = withDefaults(defineProps<{ source?: string; inner_suffix?: boolean }>(), {
	source: '',
});

// Cherry Markdown 实例
const cherryInstance = ref<Cherry | null>(null);
// 容器引用
const containerRef = ref<HTMLElement | null>(null);

// 监听主题变化
watch(
	() => getThemeConfig.value.isDark,
	() => {
		initCherryInstance();
	}
);

// 监听内容变化
watch(
	() => props.source,
	() => {
		if (cherryInstance.value) {
			cherryInstance.value.setValue(props.source);
		}
	}
);

// 初始化Cherry实例
function initCherryInstance() {
	// 销毁旧实例
	if (cherryInstance.value) {
		cherryInstance.value.destroy?.();
		cherryInstance.value = null;
	}

	// 创建新实例
	nextTick(() => {
		if (!containerRef.value) return;

		// 创建唯一ID
		const uniqueId = `markdown-container-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
		containerRef.value.id = uniqueId;

		/** @type {CherryConfig} */
		const cherryConfig: CherryOptions = {
			id: uniqueId,
			value: props.source || '',
			toolbars: {
				toolbar: [],
			},
			engine: {
				syntax: {
					codeBlock: {
						lineNumber: true,
						copyCode: true,
					},
					table: {
						enableChart: false,
						selfClosing: false,
					},
					header: {
						anchorStyle: 'none',
					},
				},
			},

			themeSettings: {
				themeList: [
					{ className: 'light', label: '浅色' },
					{ className: 'dark', label: '深色' },
				],
				mainTheme: getThemeConfig.value.isDark ? 'dark' : 'light',
				codeBlockTheme: getThemeConfig.value.isDark ? 'dark' : 'light',
				inlineCodeTheme: getThemeConfig.value.isDark ? 'red' : 'black',
				toolbarTheme: getThemeConfig.value.isDark ? 'dark' : 'light',
			},
			isPreviewOnly: true,
		};

		cherryInstance.value = new Cherry(cherryConfig);
	});
}

onMounted(() => {
	initCherryInstance();
});
</script>

<style scoped lang="scss">
.ai-md {
	:deep(.cherry-markdown) {
		p {
			margin-bottom: 0;
		}
	}
}
</style>
