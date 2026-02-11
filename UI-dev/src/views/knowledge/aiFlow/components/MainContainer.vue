<!-- 基础容器组件 -->
<template>
	<el-container class="basic-container">
		<!-- 头部卡片区域 -->
		<el-card v-if="$slots.header" class="header-card" shadow="never">
			<div class="card-title" v-if="headerTitle">{{ headerTitle }}</div>
			<slot name="header"></slot>
		</el-card>

		<!-- 主要内容区域 -->
		<el-card class="content-card" shadow="never">
			<div class="card-title" v-if="title">{{ title }}</div>
			<div class="content" v-loading="loading">
				<slot></slot>
			</div>
		</el-card>
	</el-container>
</template>

<script setup lang="ts">
import { useSlots } from 'vue';

// 定义组件属性
defineProps({
	// 主标题
	title: {
		type: String,
		default: '',
	},
	// 头部标题
	headerTitle: {
		type: String,
		default: '',
	},
	// 加载状态
	loading: {
		type: Boolean,
		default: false,
	},
});

// 获取插槽
const slots = useSlots();
</script>

<style lang="scss" scoped>
.basic-container {
	flex-direction: column;
	height: 100vh;
	background-color: #f5f7fa;
	/**padding: 20px;
  gap: 20px;**/
	box-sizing: border-box;

	.header-card {
		padding: 15px;
	}

	.content-card {
		flex: 1;
		overflow: auto;
		padding: 20px;
	}

	.card-title {
		font-size: 16px;
		font-weight: bold;
		margin-bottom: 10px;
	}

	:deep(.el-card) {
		border: none;

		.el-card__header {
			border-bottom: 1px solid var(--el-border-color-lighter);
		}

		.el-table {
			--el-table-border-color: var(--el-border-color-lighter);

			.el-table__cell {
				padding: 8px 12px;
			}
		}
	}
}
</style>
