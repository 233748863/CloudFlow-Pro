<template>
	<div>
		<div class="output-params">
			<div v-for="(param, index) in inputParams" :key="index" class="param-item">
				<svg-icon :size="24" class="param-icon" name="local-var" />
				<span class="param-name">{{ param.name }}</span>
			</div>
		</div>
	</div>
</template>

<script>
import common from './common.ts';
export default {
	name: 'CodeNode',
	mixins: [common],
};
</script>

<style scoped>
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
</style>
