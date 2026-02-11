<template>
	<div class="question-node">
		<!-- 输入参数展示 -->
		<div class="input-params">
			<div v-for="(param, index) in inputParams" :key="index" class="param-item">
				<svg-icon :size="24" class="param-icon" name="local-var" />
				<span class="param-name">{{ param.name }}</span>
			</div>

			<div class="param-item">
				<svg-icon :size="24" class="param-icon" name="local-llm" />
				<span class="param-value">{{ node.questionParams.modelConfig.model }}</span>
			</div>
		</div>
		<!-- 分类列表展示 -->
		<div class="node-info">
			<div class="info-item">
				<div class="categories-list">
					<div v-for="(item, index) in node.questionParams.categories" :key="index" class="category-item">
						<div class="category-header">
							<span class="category-name">{{ `分类${item.name}` || `分类${index + 1}` }}</span>
							<span class="category-index">{{ item.value }}</span>
						</div>
					</div>
				</div>
			</div>
		</div>
	</div>
</template>

<script>
import common from './common.ts';

export default {
	name: 'QuestionNode',
	mixins: [common],
	props: {
		node: {
			type: Object,
			required: true,
		},
	},
};
</script>

<style lang="scss" scoped>
.question-node {
	font-size: 12px;
}

.input-params {
	padding: 8px 12px;
}

.param-item {
	display: flex;
	align-items: center;
	margin-bottom: 4px;
	padding: 3px 10px;
	font-size: 13px;
	color: #333;
	border-radius: 4px;
	font-size: 12px;
	background-color: rgb(242, 244, 247);
}

.param-icon {
	color: rgb(41 112 255);
	font-weight: bold;
}

.param-name {
	color: #666;
	margin-right: 4px;
}

.node-info {
	padding: 5px 10px;
	box-sizing: border-box;
	width: 100%;

	.info-item {
		width: 100%;

		.categories-list {
			width: 100%;

			.category-item {
				width: 100%;
				padding: 4px 8px;
				box-sizing: border-box;
				background: #f8fafc;
				margin-bottom: 8px;
				border: 1px solid #e2e8f0;
				border-radius: 4px;

				.category-header {
					display: flex;
					justify-content: space-between;
					align-items: center;
					margin-bottom: 4px;

					.category-name {
						font-weight: 500;
						color: #1e293b;
					}

					.category-index {
						font-size: 11px;
						color: #64748b;
						background: #e2e8f0;
						padding: 2px 6px;
						border-radius: 10px;
					}
				}

				.category-desc {
					color: #64748b;
					font-size: 11px;
					padding: 2px 0;
				}
			}
		}
	}
}
</style>
