<template>
	<div class="switch-node">
		<div class="output-params">
			<div v-for="(param, index) in inputParams" :key="index" class="param-item">
				<svg-icon :size="24" class="param-icon" name="local-var" />
				<span class="param-name">{{ param.name }}</span>
			</div>
		</div>
		<div class="node-info">
			<div class="info-item">
				<div class="cases-list">
					<div v-for="(item, index) in node.switchParams.cases" :key="index" class="case-item">
						<div class="case-header">
							<span class="case-name">{{ item.name || `分支${index + 1}` }}</span>
							<span class="case-index">{{ item.value }}</span>
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
	name: 'SwitchNode',
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
/* 添加样式 */
.output-params {
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

.param-value {
	color: #333;
	font-weight: 500;
}
.switch-node {
	font-size: 12px;
}

.node-info {
	padding: 5px 10px;
	box-sizing: border-box;
	width: 100%;
	.info-item {
		width: 100%;
		.cases-list {
			width: 100%;

			.case-item {
				width: 100%;
				padding: 2px 8px;
				box-sizing: border-box;
				background: #f8fafc;
				margin-bottom: 8px;
				border: 1px solid #e2e8f0;
				transition: all 0.2s ease;
				.case-header {
					display: flex;
					justify-content: space-between;
					align-items: center;
					margin-bottom: 4px;

					.case-name {
						font-weight: 500;
						color: #1e293b;
					}

					.case-index {
						font-size: 11px;
						color: #64748b;
						background: #e2e8f0;
						padding: 2px 6px;
						border-radius: 10px;
					}
				}

				.case-value {
					color: #64748b;
					font-size: 11px;
					white-space: nowrap;
					overflow: hidden;
					text-overflow: ellipsis;
					padding: 2px 0;
				}
			}
		}
	}
}

.empty-text {
	color: #999;
	font-style: italic;
}
</style>
