<template>
	<div class="flex flex-col space-y-2 w-full">
		<el-button class="w-full" v-if="!isPreview" type="primary" @click="$emit('saveData')">保存数据</el-button>
		<el-button class="w-full" v-if="isPreview" type="success" @click="$emit('parseData')" :loading="isParsing" :disabled="isParsing || !hasImage">
			{{ isParsing ? '解析中...' : '解析数据' }}
		</el-button>
		<el-button class="w-full" type="warning" @click="$emit('clearAll')" style="margin-left: 0">清空图片</el-button>
	</div>
</template>

<script setup lang="ts">
defineProps({
	isPreview: Boolean,
	isParsing: Boolean,
	hasImage: Boolean,
});
</script>
