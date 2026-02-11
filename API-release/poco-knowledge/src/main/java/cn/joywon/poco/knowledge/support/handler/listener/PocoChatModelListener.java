package cn.joywon.poco.knowledge.support.handler.listener;

import cn.hutool.core.collection.CollUtil;
import cn.hutool.core.map.MapUtil;
import cn.hutool.crypto.SecureUtil;
import cn.hutool.extra.servlet.JakartaServletUtil;
import cn.joywon.poco.common.core.util.WebUtils;
import cn.joywon.poco.common.security.service.PocoUser;
import cn.joywon.poco.common.security.util.SecurityUtils;
import cn.joywon.poco.knowledge.entity.AiBillEntity;
import cn.joywon.poco.knowledge.entity.AiChatRecordEntity;
import cn.joywon.poco.knowledge.service.AiBillService;
import cn.joywon.poco.knowledge.service.AiChatRecordService;
import cn.joywon.poco.knowledge.support.util.ChatMessageContextHolder;
import dev.langchain4j.data.message.ChatMessage;
import dev.langchain4j.data.message.ChatMessageType;
import dev.langchain4j.model.chat.listener.ChatModelErrorContext;
import dev.langchain4j.model.chat.listener.ChatModelListener;
import dev.langchain4j.model.chat.listener.ChatModelRequestContext;
import dev.langchain4j.model.chat.listener.ChatModelResponseContext;
import dev.langchain4j.model.output.TokenUsage;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import org.jetbrains.annotations.NotNull;
import org.springframework.ai.tokenizer.TokenCountEstimator;
import org.springframework.context.annotation.Lazy;
import org.springframework.http.HttpHeaders;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Objects;

/**
 * @author poco
 * @date 2024/9/26
 * <p>
 * 请求监听器 <a href="https://docs.langchain4j.dev/tutorials/observability">LLM
 * Observability</a>
 */
@Service
@RequiredArgsConstructor
public class PocoChatModelListener implements ChatModelListener {

	@Lazy
	private final AiChatRecordService chatRecordService;

	private final TokenCountEstimator tokenCountEstimator;

	private final AiBillService aiBillService;

	/**
	 * 请求LLM 之前的逻辑，主要是入参处理
	 * @param requestContext 请求上下文
	 */
	@Override
	public void onRequest(ChatModelRequestContext requestContext) {
		HttpServletRequest request = WebUtils.getRequest();
		if (Objects.isNull(request)) {
			return;
		}

		String ip = JakartaServletUtil.getClientIP(request);
		String ua = request.getHeader(HttpHeaders.USER_AGENT);
		requestContext.attributes().put(AiChatRecordEntity.Fields.userAgent, ua);
		requestContext.attributes().put(AiChatRecordEntity.Fields.ip, ip);

		PocoUser user = SecurityUtils.getUser();
		String username;
		if (Objects.nonNull(user)) {
			username = user.getUsername();
		}
		else {
			username = SecureUtil.md5((ip + ua));
		}

		if (Objects.isNull(ChatMessageContextHolder.get())
				|| Objects.isNull(ChatMessageContextHolder.get().getMessageKey())) {
			return;
		}

		requestContext.attributes()
			.put(AiChatRecordEntity.Fields.recordId, ChatMessageContextHolder.get().getMessageKey());

		requestContext.attributes().put(AiChatRecordEntity.Fields.username, username);
		requestContext.attributes().put(AiBillEntity.Fields.model, requestContext.request().model());

		// 如果不是function calling，清除上下文
		if (CollUtil.isEmpty(requestContext.request().toolSpecifications())) {
			ChatMessageContextHolder.clear();
			return;
		}

		// 如果最后一条消息是 TOOL_EXECUTION_RESULT，清除上下文
		requestContext.request().messages().stream().reduce((first, second) -> second).ifPresent(message -> {
			if (message.type().equals(ChatMessageType.TOOL_EXECUTION_RESULT)) {
				ChatMessageContextHolder.clear();
			}
		});
	}

	/**
	 * 返回处理监听
	 * @param responseContext 响应上下文
	 */
	@Override
	public void onResponse(ChatModelResponseContext responseContext) {

		Long messageKey = MapUtil.getLong(responseContext.attributes(), AiChatRecordEntity.Fields.recordId);
		if (Objects.isNull(messageKey)) {
			return;
		}

		TokenUsage tokenUsage = responseContext.response().tokenUsage();

		// 部分模型不返回tokenUsage，自行计算
		if (Objects.isNull(tokenUsage)) {
			tokenUsage = getTokenUsage(responseContext);
		}

		aiBillService.saveBill(responseContext.attributes(), tokenUsage);
		chatRecordService.saveRecord(responseContext.attributes(), responseContext.response().aiMessage().text(), true);
	}

	/**
	 * 获取令牌使用情况 (针对ollama 等无法返回tokenUsage的模型)
	 * @param responseContext 响应上下文
	 * @return {@link TokenUsage }
	 */
	@NotNull
	private TokenUsage getTokenUsage(ChatModelResponseContext responseContext) {
		TokenUsage tokenUsage;
		List<ChatMessage> messages = responseContext.request().messages();
		int inputTokenCount = messages.stream()
			.map(message -> tokenCountEstimator.estimate(message.text()))
			.mapToInt(Integer::intValue) // 将 Integer 转换为 int
			.sum();

		int outputTokenCount = tokenCountEstimator.estimate(responseContext.response().aiMessage().text());
		tokenUsage = new TokenUsage(inputTokenCount, outputTokenCount);
		return tokenUsage;
	}

	/**
	 * 出错时处理逻辑
	 * @param errorContext 错误上下文
	 */
	@Override
	public void onError(ChatModelErrorContext errorContext) {
		Throwable error = errorContext.error();

		if (Objects.isNull(ChatMessageContextHolder.get())
				|| Objects.isNull(ChatMessageContextHolder.get().getMessageKey())) {
			return;
		}

		Long messageKey = ChatMessageContextHolder.get().getMessageKey();
		if (Objects.isNull(messageKey)) {
			return;
		}

		chatRecordService.saveRecord(errorContext.attributes(), error.getMessage(), false);
	}

}
