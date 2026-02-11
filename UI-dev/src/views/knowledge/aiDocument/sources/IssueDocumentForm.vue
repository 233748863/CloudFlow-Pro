<template>
	<el-col class="mb20">
		<el-form-item label="仓库类型" prop="repoType">
			<el-select v-model="modelValue.repoType" placeholder="请选择仓库类型">
				<el-option label="Gitee" value="gitee"></el-option>
				<el-option label="GitHub" value="github"></el-option>
			</el-select>
		</el-form-item>
	</el-col>
	<el-col class="mb20">
		<el-form-item label="拥有者" prop="repoOwner">
			<el-input v-model="modelValue.repoOwner" placeholder="请输入仓库拥有者username"></el-input>
		</el-form-item>
	</el-col>
	<el-col class="mb20">
		<el-form-item label="仓库名称" prop="repoName">
			<el-input v-model="modelValue.repoName" placeholder="请输入仓库名称"></el-input>
		</el-form-item>
	</el-col>
	<el-col class="mb20">
		<el-form-item label="访问令牌" prop="accessToken">
			<el-input v-model="modelValue.accessToken" placeholder="请输入访问令牌" show-password></el-input>
		</el-form-item>
	</el-col>
</template>

<script setup lang="ts">
import { PropType } from 'vue';

const props = defineProps({
	modelValue: {
		type: Object as PropType<any>,
		required: true,
	},
});

defineEmits(['update:modelValue']);
</script>
