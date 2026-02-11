import type { ChatMessage } from './index';
import { useUserInfo } from '/@/stores/userInfo';
import { Session } from '/@/utils/storage';

/**
 * Process a message to extract any thought content enclosed in <think> tags
 * and update the message object accordingly
 */
export function withMessageThought(message: ChatMessage, startTime?: number) {
	const content = message.content;

	// If message already has reasoning_content, calculate thinking time
	if (message.reasoning_content) {
		const thinkingTime = startTime ? ((Date.now() - startTime) / 1000).toFixed(1) : '0.5';
		message.thinking_time = thinkingTime;
		// @ts-ignore - Add isThinking flag
		message.isThinking = false;
		return message;
	}

	const thinkPattern = /<think>(.*?)<\/think>/s;
	const matches = content.match(thinkPattern);

	if (matches) {
		const reasoning_content = matches[1].trim();
		const remainingContent = content.replace(thinkPattern, '').trim();

		if (reasoning_content) {
			// Calculate thinking time
			const thinkingTime = startTime ? ((Date.now() - startTime) / 1000).toFixed(1) : '0.5';

			// @ts-ignore - Add reasoning properties
			message.reasoning_content = reasoning_content;
			message.thinking_time = thinkingTime;
			message.content = remainingContent;
			// @ts-ignore - Add isThinking flag
			message.isThinking = true;
			return message;
		}
	}

	return message;
}

/**
 * Wrap message content with think tags in deep reasoning mode
 */
export function wrapWithThought(content: string, datasetId?: string | null): string {
	// Only wrap content in deep reasoning mode
	if (datasetId === '-5') {
		return `<think>让我详细分析一下这个问题：

${content}
</think>

基于以上分析，我的回答是：

${content}`;
	}
	return content;
}

/**
 * 从会话存储中获取访问令牌
 * @returns {string} 访问令牌
 */
const token = computed(() => {
	return Session.getToken();
});

/**
 * 生成会话存储的key
 * @returns {string} 会话存储key
 */
export const generateConversationKey = (knowledgeId: string, notime?: boolean) => {
	// 使用原始格式key，保持兼容历史组件
	return `chat-${knowledgeId}-${useUserInfo().userInfos.user.userId}-${token.value}-${notime ? '' : Date.now()}`;
};
