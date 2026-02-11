<template>
	<div class="line-chart">
		<svg :width="width" :height="height">
			<!-- 绘制折线 -->
			<path :d="pathD" fill="none" stroke="#67c23a" stroke-width="2" />
			<!-- 绘制点 -->
			<circle v-for="point in points" :key="point.x" :cx="point.x" :cy="point.y" r="4" fill="#67c23a" />
		</svg>
	</div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

// 定义数据点接口
interface DataPoint {
	value: number;
	[key: string]: any;
}

// 定义坐标点接口
interface Point {
	x: number;
	y: number;
}

// 定义组件属性
const props = defineProps({
	data: {
		type: Array as () => DataPoint[],
		required: true,
	},
});

// 图表尺寸
const width = 500;
const height = 100;
const padding = 20;

// 计算坐标点
const points = computed(() => {
	if (!props.data.length) return [];

	const xStep = (width - padding * 2) / (props.data.length - 1);
	const maxValue = Math.max(...props.data.map((d) => d.value));
	const yScale = maxValue ? (height - padding * 2) / maxValue : 1;

	return props.data.map((d, i) => ({
		x: padding + i * xStep,
		y: height - padding - d.value * yScale,
	}));
});

// 生成SVG路径
const pathD = computed(() => {
	if (!points.value.length) return '';

	return points.value.reduce((path, point, i) => {
		return path + (i === 0 ? `M ${point.x},${point.y}` : ` L ${point.x},${point.y}`);
	}, '');
});
</script>

<style scoped>
.line-chart {
	width: 100%;
	height: 100%;
	display: flex;
	justify-content: center;
	align-items: center;
}
</style>
