<template>
	<el-dialog
		:model-value="modelValue"
		@update:model-value="(val: boolean) => emit('update:modelValue', val)"
		title="API 信息"
		width="600px"
		:close-on-click-modal="false"
		:close-on-press-escape="false"
	>
		<div class="bg-white rounded-lg shadow-md api-info">
			<div class="mb-4">
				<div class="p-4 bg-gray-50 rounded-lg border border-gray-200 shadow-sm">
					<div class="mb-4">
						<div class="flex justify-between items-center mb-2">
							<span class="text-lg font-semibold text-gray-800">接口地址</span>
						</div>
						<div class="pb-2 text-base text-gray-600 border-b border-gray-300">
							{{ apiUrl }}
						</div>
					</div>

					<div class="mb-4">
						<div class="flex justify-between items-center mb-2">
							<span class="text-lg font-semibold text-gray-800">请求方法</span>
						</div>
						<div class="text-base text-gray-600">POST</div>
					</div>

					<div class="mb-4">
						<div class="flex justify-between items-center mb-2">
							<span class="text-lg font-semibold text-gray-800">请求头</span>
						</div>
						<div class="text-base text-gray-600" v-html="headers"></div>
					</div>

					<div>
						<div class="flex justify-between items-center mb-2">
							<span class="text-lg font-semibold text-gray-800">请求体</span>
						</div>
						<div class="text-base text-gray-600">
							{{ requestBody }}
						</div>
					</div>
				</div>

				<div class="mt-4">
					<div class="flex justify-between items-center mb-2">
						<span class="font-medium">CURL 命令</span>
						<el-button type="primary" link @click="copyText(curlCommand)">复制</el-button>
					</div>
					<div class="w-full mockup-code">
						<pre data-prefix=""> <code >{{ curlCommand }}</code> </pre>
					</div>
				</div>
			</div>
		</div>
	</el-dialog>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { ElMessage } from 'element-plus';
import { Session } from '/@/utils/storage';

const props = defineProps({
	modelValue: {
		type: Boolean,
		required: true,
	},
	flowId: {
		type: String,
		required: true,
	},
});

const emit = defineEmits(['update:modelValue']);

const isMicro = import.meta.env.VITE_IS_MICRO === 'true' ? true : false;
const apiUrl = computed(() => `${window.location.origin}/api/${isMicro ? 'knowledge' : 'admin'}/aiFlow/execute`);

const headers = computed(
	() =>
		`Content-Type: application/json<br>
	Authorization: Bearer ${Session.getToken()}`
);

const requestBody = computed(() =>
	JSON.stringify(
		{
			id: props.flowId,
			params: {},
			envs: {},
		},
		null,
		2
	)
);

const curlCommand = computed(
	(): string =>
		`curl -X POST '${apiUrl.value}' \\
	    --header 'Authorization: Bearer ${Session.getToken()}' \\
	    --header 'Content-Type: application/json' \\
	    --data-raw '{
          "id": "${props.flowId}",
          "params": {},
          "envs": {}
      }'`
);

const copyText = async (text: string) => {
	try {
		await navigator.clipboard.writeText(text);
		ElMessage.success('复制成功');
	} catch (err) {
		ElMessage.error('复制失败');
	}
};

const handleClose = () => {
	emit('update:modelValue', false);
};
</script>

<style lang="scss" scoped>
.api-info {
	code {
		font-family: Monaco, monospace;
		font-size: 0.9em;
	}
}
</style>
