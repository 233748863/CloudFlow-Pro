package cn.joywon.poco.knowledge.service.impl;

import cn.hutool.core.map.MapUtil;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import cn.joywon.poco.common.core.constant.enums.YesNoEnum;
import cn.joywon.poco.knowledge.config.properties.AiKnowledgeProperties;
import cn.joywon.poco.knowledge.dto.ChatMessageDTO;
import cn.joywon.poco.knowledge.entity.AiBillEntity;
import cn.joywon.poco.knowledge.entity.AiChatRecordEntity;
import cn.joywon.poco.knowledge.mapper.AiBillMapper;
import cn.joywon.poco.knowledge.service.AiBillService;
import dev.langchain4j.model.output.TokenUsage;
import lombok.RequiredArgsConstructor;
import org.springframework.ai.tokenizer.TokenCountEstimator;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Map;

/**
 * 账单
 *
 * @author pig
 * @date 2024-03-26 11:26:59
 */
@Service
@RequiredArgsConstructor
public class AiBillServiceImpl extends ServiceImpl<AiBillMapper, AiBillEntity> implements AiBillService {

	private final AiKnowledgeProperties aiKnowledgeProperties;

	private final TokenCountEstimator tokenCountEstimator;

	/**
	 * 保存账单
	 * @param map 参数
	 * @param tokenUsage 令牌使用情况
	 */
	@Override
	public void saveBill(Map<Object, Object> map, TokenUsage tokenUsage) {
		AiBillEntity aiBillEntity = new AiBillEntity();
		aiBillEntity.setTokenType(YesNoEnum.NO.getCode());
		aiBillEntity.setPromptTokens(tokenUsage.inputTokenCount().longValue());
		aiBillEntity.setCompletionTokens(tokenUsage.outputTokenCount().longValue());
		aiBillEntity.setTokens(tokenUsage.totalTokenCount().longValue());

		String ip = MapUtil.getStr(map, AiChatRecordEntity.Fields.ip);
		String username = MapUtil.getStr(map, AiChatRecordEntity.Fields.username);

		aiBillEntity.setIp(ip);
		aiBillEntity.setUsername(username);
		aiBillEntity.setCreateBy(username);

		Long messageKey = MapUtil.getLong(map, AiChatRecordEntity.Fields.recordId);
		aiBillEntity.setMessageKey(messageKey);
		String model = MapUtil.getStr(map, AiBillEntity.Fields.model);
		aiBillEntity.setModel(model);
		baseMapper.insert(aiBillEntity);
	}

	/**
	 * This method is used to get the sum of the bill.
	 * @return List<Map < String, Object>> This returns a list of map which contains the
	 * sum of the bill.
	 */
	@Override
	public List<Map<String, Object>> getBillSum() {
		return baseMapper.selectBillSum();
	}

	/**
	 * 获取输入 tokens 总数
	 * @param chatMessageDTO 聊天信息
	 * @return tokens 总数
	 */
	private Long getInputTokens(ChatMessageDTO chatMessageDTO) {
		return this.getTokens(chatMessageDTO.getContent());
	}

	/**
	 * 获取 tokens 总数
	 * @param text 输入总数
	 * @return 字符总数
	 */
	private Long getTokens(String text) {
		return (long) tokenCountEstimator.estimate(text);
	}

}
