package cn.joywon.poco.knowledge.support.rule;

import cn.joywon.poco.knowledge.dto.ChatMessageContext;
import com.yomahub.liteflow.core.NodeBooleanComponent;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

/**
 * 判断消息是否是内部消息
 *
 * @author poco
 * @date 2024/4/14
 */
@Slf4j
@Component("isInner")
@RequiredArgsConstructor
public class IsInnerChatRule extends NodeBooleanComponent {

	@Override
	public boolean processBoolean() throws Exception {
		ChatMessageContext messageContext = this.getContextBean(ChatMessageContext.class);
		return messageContext.getChatMessageDTO().isInner();
	}

}
