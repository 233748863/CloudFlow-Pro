package cn.joywon.poco.knowledge.support.rule;

import cn.joywon.poco.knowledge.dto.AiMessageResultDTO;
import cn.joywon.poco.knowledge.dto.ChatMessageDTO;
import reactor.core.publisher.Flux;

/**
 * chat 抽象
 *
 * @author poco
 * @date 2024/6/3
 */
public interface ChatRule {

    /**
     * 处理聊天信息
     *
     * @param chatMessageDTO 聊天上文
     * @return flux stream
     */
    default Flux<AiMessageResultDTO> process(ChatMessageDTO chatMessageDTO) {
        return Flux.empty();
    }

}
