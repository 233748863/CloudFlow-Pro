<!--
* @Description: 全屏遮罩组件，用于提示应用未发布状态
* @Author: Claude
* @Date: 2024-02-07
-->
<template>
	<div v-if="visible" class="unpublished-mask">
		<div class="mask-content">
			<el-icon class="warning-icon"><WarningFilled /></el-icon>
			<h2 class="title">应用未发布</h2>
			<p class="description">当前应用尚未发布，请先发布应用后再进行操作</p>
		</div>
	</div>
</template>

<script setup lang="ts">
import { WarningFilled } from '@element-plus/icons-vue';

// 定义组件属性
defineProps({
	visible: {
		type: Boolean,
		default: false,
	},
});
</script>

<style lang="scss" scoped>
.unpublished-mask {
	position: fixed;
	top: 0;
	left: 0;
	right: 0;
	bottom: 0;
	background-color: rgba(0, 0, 0, 0.7);
	z-index: 9999;
	display: flex;
	justify-content: center;
	align-items: center;

	.mask-content {
		background-color: #fff;
		padding: 40px;
		border-radius: 8px;
		text-align: center;
		max-width: 400px;
		width: 90%;
	}

	.warning-icon {
		font-size: 48px;
		color: #e6a23c;
		margin-bottom: 16px;
	}

	.title {
		font-size: 24px;
		color: #303133;
		margin-bottom: 16px;
		font-weight: 500;
	}

	.description {
		font-size: 16px;
		color: #606266;
		margin-bottom: 24px;
		line-height: 1.5;
	}

	.publish-btn {
		padding: 12px 24px;
		font-size: 16px;
	}
}
</style>
