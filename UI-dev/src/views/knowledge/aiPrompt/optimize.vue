<template>
	<el-dialog v-model="dialogVisible" title="优化提示词" width="80%" :close-on-click-modal="false">
		<div class="flex">
			<div class="w-5/12 pr-4">
				<el-input v-model="inputPrompt" type="textarea" :rows="24" placeholder="请输入提示词"></el-input>
			</div>
			<div class="flex flex-col items-center justify-center w-2/12">
				<model-list model-type="Chat" class="mb-8" />
				<el-button class="z-10 mb-4" type="primary" @click="optimizePrompt" :loading="isOptimizing"> 点击优化 </el-button>
				<div class="relative w-full h-2 bg-primary">
					<div
						class="absolute right-4 top-1/2 transform translate-y-[-50%] translate-x-[100%] w-0 h-0 border-t-[10px] border-t-transparent border-b-[10px] border-b-transparent border-l-[20px] border-l-primary"
					></div>
				</div>
			</div>
			<div class="w-5/12 pl-4 overflow-y-auto border-2 h-[514px]">
				<div class="mt-4">
					<md-renderer :source="optimizedPrompt" />
				</div>
			</div>
		</div>
		<template #footer>
			<div class="flex items-center justify-center w-full h-16">
				<el-button type="primary" @click="onSubmit" :loading="loading">确认</el-button>
			</div>
		</template>
	</el-dialog>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import MdRenderer from '/@/components/MdRenderer/MdRenderer.vue';
import ModelList from '/@/views/knowledge/aiChat/components/widgets/modelList.vue';
import { optimizeAiPrompt, putObj } from '/@/api/knowledge/aiPrompt';
import { useMessage } from '/@/hooks/message';
import { Local, Session } from '/@/utils/storage';

const dialogVisible = ref(false);
const inputPrompt = ref('');
const optimizedPrompt = ref('');
const isOptimizing = ref(false);
const loading = ref(false);
const currentId = ref('');

const emit = defineEmits(['refresh']);

function openDialog(row: any) {
	inputPrompt.value = row.prompt;
	optimizedPrompt.value = '';
	currentId.value = row.id;
	dialogVisible.value = true;
}
async function optimizePrompt() {
	isOptimizing.value = true;
	try {
		const selectedModel = Local.get(`selectedAiModel:Chat`);

		const { data } = await optimizeAiPrompt({ prompt: inputPrompt.value, modelName: selectedModel?.value });
		optimizedPrompt.value = data;
	} catch (error) {
		useMessage().error('优化失败，请重试');
	} finally {
		isOptimizing.value = false;
	}
}

async function onSubmit() {
	if (!optimizedPrompt.value) {
		useMessage().warning('请先进行优化');
		return;
	}

	loading.value = true;
	try {
		await putObj({
			id: currentId.value,
			prompt: optimizedPrompt.value,
		});
		useMessage().success('更新成功');
		dialogVisible.value = false;
		emit('refresh');
	} catch (error) {
		useMessage().error('更新失败，请重试');
	} finally {
		loading.value = false;
	}
}

defineExpose({
	openDialog,
});
</script>
