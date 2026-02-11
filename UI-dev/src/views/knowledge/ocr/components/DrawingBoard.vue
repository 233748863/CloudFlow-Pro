<template>
	<div class="w-full h-[80vh] overflow-y-auto relative">
		<div class="flex absolute top-0 left-0 z-20 items-center px-4 py-2 w-full bg-white bg-opacity-70">
			<el-button-group class="mr-4">
				<el-button @click="rotateImage(-90)" :icon="Refresh" circle></el-button>
				<el-button @click="zoomIn" :icon="ZoomIn" circle></el-button>
				<el-button @click="zoomOut" :icon="ZoomOut" circle></el-button>
			</el-button-group>
		</div>
		<vk-stage
			v-if="imageUrl"
			ref="stageRef"
			class="mt-12 w-full cursor-pointer"
			:config="stageConfig"
			@dblclick="handleStageDoubleClick"
			@contextmenu.prevent="handleStageContextMenu"
		>
			<vk-layer>
				<vk-image :config="imageConfig" />
			</vk-layer>
		</vk-stage>
	</div>
</template>

<script setup>
import { computed, ref } from 'vue';
import { Refresh, ZoomIn, ZoomOut } from '@element-plus/icons-vue';

const props = defineProps(['config', 'imageUrl', 'imageElement', 'markers', 'isPreview']);
const emit = defineEmits([
	'addMarker',
	'updateMarkerPosition',
	'updateMarkerSize',
	'removeMarker',
	'addDescription',
	'showContextMenu',
	'markerClick',
	'updateConfig',
]);

const stageRef = ref(null);

const stageConfig = computed(() => {
	const containerWidth = document.querySelector('.konvajs-content')?.clientWidth || window.innerWidth;

	return {
		width: containerWidth,
		height: props.config.height,
		scaleX: props.config.scale,
		scaleY: props.config.scale,
		style: { width: '100%' },
	};
});

const imageConfig = computed(() => {
	const rotation = props.config.rotation || 0;
	const isRotated90or270 = rotation % 180 === 90;

	return {
		x: props.config.width / 2,
		y: props.config.height / 2,
		image: props.imageElement,
		width: isRotated90or270 ? props.config.height : props.config.width,
		height: isRotated90or270 ? props.config.width : props.config.height,
		offsetX: (isRotated90or270 ? props.config.height : props.config.width) / 2,
		offsetY: (isRotated90or270 ? props.config.width : props.config.height) / 2,
		rotation: rotation,
	};
});

const rotateImage = (angle) => {
	emit('updateConfig', {
		...props.config,
		rotation: (props.config.rotation || 0) + angle,
	});
};

const zoomIn = () => {
	emit('updateConfig', {
		...props.config,
		scale: (props.config.scale || 1) * 1.1,
	});
};

const zoomOut = () => {
	emit('updateConfig', {
		...props.config,
		scale: (props.config.scale || 1) / 1.1,
	});
};

const handleStageDoubleClick = (event) => {
	if (props.isPreview) return;
	const stage = event.target.getStage();
	const pos = stage.getPointerPosition();

	// 获取旋转角度
	const rotation = props.config.rotation || 0;
	const isRotated90or270 = rotation % 180 === 90;

	// 计算相对于图片中心的坐标
	const centerX = props.config.width / 2;
	const centerY = props.config.height / 2;

	// 转换点击坐标到旋转后的坐标系
	let adjustedX = pos.x - centerX;
	let adjustedY = pos.y - centerY;

	// 根据旋转角度调整坐标
	const rad = (rotation * Math.PI) / 180;
	const cos = Math.cos(rad);
	const sin = Math.sin(rad);

	const rotatedX = adjustedX * cos + adjustedY * sin;
	const rotatedY = -adjustedX * sin + adjustedY * cos;

	// 转换回绝对坐标
	const finalX = rotatedX + centerX;
	const finalY = rotatedY + centerY;

	emit('addMarker', {
		evt: {
			offsetX: finalX,
			offsetY: finalY,
			rotation: rotation, // 传递当前旋转角度
		},
	});
};

const handleStageContextMenu = (event) => {
	if (props.isPreview) return;
	const stage = event.target.getStage();
	const pos = stage.getPointerPosition();
	emit('showContextMenu', {
		x: pos.x,
		y: pos.y,
		items: [{ text: '添加标记', action: () => handleStageDoubleClick(event) }],
	});
};

const getStage = () => {
	return stageRef.value ? stageRef.value.getNode() : null;
};

defineExpose({ getStage });
</script>

<style>
.konvajs-content {
	width: 100% !important;
}

canvas {
	width: 100% !important;
}
</style>
