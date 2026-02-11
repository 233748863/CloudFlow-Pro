<template>
	<div class="flex flex-col min-w-[800px] h-[400px]">
		<div class="overflow-hidden relative flex-grow w-full h-full">
			<div class="flex absolute top-2 left-2 z-10 flex-wrap gap-1 justify-center p-2 rounded-md shadow-sm backdrop-blur-sm bg-white/80">
				<el-button text icon="zoom-in" @click="onZoomIn" title="放大"> </el-button>
				<el-button text icon="zoom-out" @click="onZoomOut" title="缩小"> </el-button>
				<el-button text icon="full-screen" @click="onZoomFill" title="适应画布"> </el-button>
				<el-divider direction="vertical" />
				<el-button text icon="refresh-right" @click="onReload" title="重新加载"> </el-button>
				<el-button text icon="picture" @click="onSaveImage" title="保存为图片"> </el-button>
			</div>
			<svg ref="svgRef" class="w-full h-full color-primary"></svg>
		</div>
	</div>
</template>

<script lang="ts" setup>
import { Transformer } from 'markmap-lib';
import { Markmap } from 'markmap-view';
import { ElMessage } from 'element-plus';
import { ref, onMounted, watch } from 'vue';

const props = defineProps<{
	text: string;
}>();

const svgRef = ref<SVGElement | null>(null);
let instance: Markmap | null = null;

const transformAndRender = (text: string) => {
	if (!instance) return;

	try {
		const transformer = new Transformer();
		const { root } = transformer.transform(text);
		instance.setData(root);
		instance.fit();
	} catch (error) {
		ElMessage.error('思维导图渲染失败，请检查内容格式');
	}
};

onMounted(() => {
	if (!svgRef.value) return;

	// Create markmap with additional options
	instance = Markmap.create(svgRef.value, {
		autoFit: true,
		duration: 500, // animation duration
		maxWidth: 300, // max node width
		color: (node: any) => {
			// Custom coloring based on depth
			const colors = ['#4CAF50', '#2196F3', '#FF9800', '#E91E63', '#9C27B0', '#3F51B5'];
			return colors[node.depth % colors.length];
		},
	});

	transformAndRender(props.text);
});

watch(
	() => props.text,
	(val) => {
		transformAndRender(val);
	}
);

function onZoomIn() {
	instance?.rescale(1.5);
}

function onZoomOut() {
	instance?.rescale(0.75);
}

function onZoomFill() {
	instance?.fit();
}

function onReload() {
	transformAndRender(props.text);
}

function onSaveImage() {
	try {
		if (!svgRef.value) return;

		// Create a canvas
		const canvas = document.createElement('canvas');
		const svgRect = svgRef.value.getBoundingClientRect();
		canvas.width = svgRect.width;
		canvas.height = svgRect.height;

		// Convert SVG to data URL
		const svgData = new XMLSerializer().serializeToString(svgRef.value);
		const svgURL = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgData);

		// Draw SVG on canvas and download
		const img = new Image();
		img.onload = () => {
			const ctx = canvas.getContext('2d');
			ctx?.drawImage(img, 0, 0);

			// Create download link
			const link = document.createElement('a');
			link.download = 'mindmap.png';
			link.href = canvas.toDataURL('image/png');
			link.click();
		};
		img.src = svgURL;

		ElMessage.success('图片已保存');
	} catch (error) {
		ElMessage.error('保存图片失败');
	}
}
</script>

<style scoped>
:deep(g.markmap-node) {
	cursor: pointer;
}

:deep(g.markmap-node > circle) {
	transition: all 0.3s ease;
}

:deep(g.markmap-node:hover > circle) {
	filter: brightness(1.2);
	r: 6px;
}

:deep(g.markmap-link > path) {
	transition: stroke-width 0.3s ease;
}

:deep(g.markmap-link:hover > path) {
	stroke-width: 2.5px;
}
</style>
