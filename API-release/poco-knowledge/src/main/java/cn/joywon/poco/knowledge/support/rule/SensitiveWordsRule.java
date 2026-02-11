package cn.joywon.poco.knowledge.support.rule;

import cn.hutool.extra.spring.SpringUtil;
import com.github.houbb.sensitive.word.bs.SensitiveWordBs;
import cn.joywon.poco.common.core.constant.enums.YesNoEnum;
import cn.joywon.poco.knowledge.config.properties.AiKnowledgeProperties;
import cn.joywon.poco.knowledge.dto.ChatMessageContext;
import cn.joywon.poco.knowledge.entity.AiChatRecordEntity;
import cn.joywon.poco.knowledge.entity.AiDatasetEntity;
import cn.joywon.poco.knowledge.mapper.AiChatRecordMapper;
import cn.joywon.poco.knowledge.support.constant.LLMUseStatusEnums;
import com.yomahub.liteflow.core.NodeComponent;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.Objects;

/**
 * 基于敏感词的风控规则
 *
 * @author poco
 * @date 2024/3/26
 */
@Slf4j
@Component("sensitive")
@RequiredArgsConstructor
public class SensitiveWordsRule extends NodeComponent {

	private final AiChatRecordMapper aiChatRecordMapper;

	private final AiKnowledgeProperties aiKnowledgeProperties;

	@Override
	public void process() {
		ChatMessageContext messageContext = this.getContextBean(ChatMessageContext.class);
		AiDatasetEntity aiDataset = messageContext.getAiDataset();

		// 默认的知识库
		if (Objects.isNull(aiDataset)) {
			aiDataset = new AiDatasetEntity();
			aiDataset.setSensitiveFlag(aiKnowledgeProperties.getRiskControl().isSensitiveWord()
					? YesNoEnum.YES.getCode() : YesNoEnum.NO.getCode());
			aiDataset.setSensitiveMsg(aiKnowledgeProperties.getRiskControl().getSensitiveMsg());
		}

		// 判断是否开启了敏感词过滤
		if (YesNoEnum.NO.getCode().equals(aiDataset.getSensitiveFlag())) {
			return;
		}

		// 敏感词过滤
		SensitiveWordBs sensitiveWordBs = SpringUtil.getBean(SensitiveWordBs.class);
		if (sensitiveWordBs.contains(messageContext.getChatMessageDTO().getContent())) {
			// 更新回答，触发敏感词
			Long messageKey = messageContext.getChatMessageDTO().getMessageKey();
			AiChatRecordEntity aiChatRecordEntity = new AiChatRecordEntity();
			aiChatRecordEntity.setRecordId(messageKey);
			aiChatRecordEntity.setLlmFlag(LLMUseStatusEnums.SENSITIVE.getStatus());
			aiChatRecordEntity.setAnswerText(aiDataset.getSensitiveMsg());
			aiChatRecordMapper.updateById(aiChatRecordEntity);
			// 更新聊天
			messageContext.setErrorMessage(aiDataset.getSensitiveMsg());
			// 设置结束
			setIsEnd(true);
		}
	}

}
