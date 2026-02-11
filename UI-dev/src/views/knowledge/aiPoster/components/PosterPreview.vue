<template>
	<el-card class="box-card">
		<template #header>
			<div class="card-header">
				<span>{{ $t('poster.preview') }}</span>
				<div class="operation-buttons">
					<el-button type="primary" @click="exportPoster">
						<el-icon><Download /></el-icon>
						{{ $t('poster.export') }}
					</el-button>
				</div>
			</div>
		</template>

		<div class="poster-preview" ref="posterRef">
			<div class="poster-content" contenteditable="true" v-html="posterContent"></div>
		</div>
	</el-card>
</template>

<script setup lang="ts" name="PosterPreview">
import { ElMessage } from 'element-plus';
import { Download } from '@element-plus/icons-vue';
import html2canvas from 'html2canvas-pro';
import { useI18n } from 'vue-i18n';

// Use i18n
const { t } = useI18n();

// eslint-disable-next-line
const props = defineProps<{
	posterGenerated: boolean;
	templateCode?: string;
}>();

const posterRef = ref<HTMLElement | null>(null);

const posterContent = computed(() => {
	return props.templateCode;
});

// Export poster as image
const exportPoster = async () => {
	try {
		// Safe access to posterRef
		if (!posterRef.value) {
			ElMessage.error(t('poster.export') + '失败，请重试');
			return;
		}

		const futuristicCard = posterRef.value.querySelector('.poster-content') as HTMLElement;
		if (!futuristicCard) {
			ElMessage.error(t('poster.export') + '失败，未找到海报内容');
			return;
		}

		const canvas = await html2canvas(futuristicCard, {
			useCORS: true,
			scale: 2,
			backgroundColor: null,
		});

		const link = document.createElement('a');
		link.download = `poster-${Date.now()}.png`;
		link.href = canvas.toDataURL('image/png');
		link.click();
		ElMessage.success(t('poster.export') + '成功');
	} catch (error) {
		// Use type-safe error handling
		const errorMessage = error instanceof Error ? error.message : String(error);
		ElMessage.error(`${t('poster.export')}失败: ${errorMessage}`);
	}
};

// Expose methods to parent component
defineExpose({
	exportPoster,
});
</script>

<style scoped>
.box-card {
	width: 100%;
	display: flex;
	flex-direction: column;
	height: 100%;
}

.card-header {
	display: flex;
	justify-content: space-between;
	align-items: center;
}

.poster-preview {
	flex: 1;
	overflow: hidden;
	display: flex;
	justify-content: center;
	align-items: center;
	padding: 0;
}

.poster-content {
	width: 100%;
	height: 100%;
	display: flex;
	justify-content: center;
	align-items: center;
}

:deep(.futuristic-card) {
	transform-origin: center;
	transform: scale(0.95);
	margin: 0 auto;
	width: 100%;
	max-width: 480px;
}

:deep(body) {
	overflow: hidden;
	height: 100%;
}

:deep(.el-card__body) {
	height: 100%;
	padding: 10px;
	overflow: hidden;
}
</style>
