package cn.joywon.poco.knowledge.support.rule;

import cn.joywon.poco.knowledge.dto.ChatMessageContext;
import cn.joywon.poco.knowledge.dto.ChatMessageDTO;
import cn.joywon.poco.knowledge.support.constant.ChatTypeEnums;
import com.yomahub.liteflow.core.NodeSwitchComponent;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.Objects;

/**
 * 是否是简单聊天
 *
 * @author poco
 * @date 2024/3/26
 */
@Slf4j
@Component("selectChatType")
public class ChatTypeSelectRule extends NodeSwitchComponent {

	@Override
	public String processSwitch() throws Exception {
		ChatMessageContext messageContext = this.getContextBean(ChatMessageContext.class);
		ChatMessageDTO lastUserMessage = messageContext.getChatMessageDTO();

		// 选择聊天类型
		ChatTypeEnums chatTypeEnums = ChatTypeEnums.fromCode(lastUserMessage.getDatasetId());
		return Objects.requireNonNullElse(chatTypeEnums, ChatTypeEnums.VECTOR_CHAT).getType();

	}

}
