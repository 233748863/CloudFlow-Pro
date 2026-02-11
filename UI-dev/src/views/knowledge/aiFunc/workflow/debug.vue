<template>
	<el-card class="flex flex-col">
		<template #header>
			<div class="flex justify-between items-center h-8">
				<h1 class="text-xl font-bold">③ 调试</h1>
			</div>
		</template>

		<!-- Using the reusable chat-window component -->
		<chat-window class="h-[70%]" ref="chatWindowRef" knowledge-id="-5" :role-alias="roleAlias" />
	</el-card>
</template>

<script setup lang="ts">
import { useUserInfo } from '/@/stores/userInfo';
import { useMessage } from '/@/hooks/message';
import { isEdit } from '/@/views/knowledge/aiFunc/workflow/design/utils';
import ChatWindow from '/@/views/knowledge/aiChat/components/chat-window.vue';

const chatWindowRef = ref();

const props = defineProps({
	funcName: String,
	welcomeMsg: String,
});

// Define role aliases
const roleAlias = computed(() => ({
	user: useUserInfo().userInfos.user.avatar,
	assistant: 'AI 助手',
	system: 'System',
}));

// Add validation check before sending messages
watch(
	() => chatWindowRef.value,
	(newVal) => {
		if (newVal) {
			// Store the original sendChatMessage function
			const originalSendMessage = newVal.sendChatMessage;
			// Override with our version that includes validation
			newVal.sendChatMessage = (content: string) => {
				// Validate if function is published
				if (!isEdit()) {
					useMessage().error('请先发布 ① 编排配置');
					return false;
				}
				// If validation passes, call the original function
				return originalSendMessage(content);
			};
		}
	},
	{ immediate: true }
);

// Expose methods that might be needed by parent components
defineExpose({
	clearStoreMessageList: () => chatWindowRef.value?.clearStoreMessageList(),
	sendChatMessage: (content: string) => chatWindowRef.value?.sendChatMessage(content),
	getMessages: () => chatWindowRef.value?.getMessages(),
});
</script>
