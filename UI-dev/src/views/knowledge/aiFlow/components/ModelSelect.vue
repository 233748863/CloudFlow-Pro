<template>
	<el-select v-model="selectedModel" class="w-full model-select" :disabled="disabled" @change="handleChange">
		<template #label>
			<div style="display: flex; align-items: center">
				<img v-if="currentModelIcon" :src="currentModelIcon" class="icon-img" :alt="String(selectedModel)" />
				<span>{{ selectedModel }}</span>
			</div>
		</template>
		<el-option v-for="item in modelList" :key="item.value" :label="item.label" :value="item.label">
			<template #default>
				<div style="display: flex; align-items: center">
					<svg-icon :size="24" class="param-icon" name="local-llm" />
					<span>{{ item.label }}</span>
				</div>
			</template>
		</el-option>
	</el-select>
</template>

<script setup lang="ts">
import { ref, onMounted, computed, PropType } from 'vue';
import { list } from '/@/api/knowledge/aiModel';
import { ElMessage } from 'element-plus';

// 定义模型接口
interface Model {
	id: number;
	modelName: string;
	icon: string;
	label?: string;
	value?: string | number;
}

// 定义组件属性
const props = defineProps({
	disabled: {
		type: Boolean,
		default: false,
	},
	type: {
		type: Array as PropType<string[]>,
		default: () => ['Chat', 'Reason'],
	},
	// v-model绑定值
	modelValue: {
		type: [String, Number],
		required: true,
	},
});

// 定义事件
const emit = defineEmits(['update:modelValue']);

// 模型列表数据
const modelList = ref<Model[]>([]);

// 计算属性：用于双向绑定
const selectedModel = computed({
	get: () => props.modelValue,
	set: (value) => emit('update:modelValue', value),
});

// 计算当前选中模型的图标
const currentModelIcon = computed(() => {
	const currentModel = modelList.value.find((item) => item.label === selectedModel.value);
	return currentModel ? currentModel.icon : '';
});

// 获取模型列表数据
const getModelListData = async () => {
	try {
		// 调用后台API获取模型列表
		const response = await list({ modelType: props.type });
		if (response && response.data) {
			// 处理数据，添加label和value字段
			modelList.value = response.data.map((item: any) => ({
				...item,
				label: item.name,
				value: item.id,
			}));
		}
	} catch (error) {
		ElMessage.error('获取模型列表失败');
	}
};

// 处理模型变更
const handleChange = (val: string | number) => {
	emit('update:modelValue', val);
};

// 组件挂载时获取数据
onMounted(() => {
	getModelListData();
});
</script>

<style lang="scss">
.model-select {
	margin-left: 10px;
}
.icon-img {
	width: 20px;
	height: 20px;
	margin-right: 8px;
}
</style>
