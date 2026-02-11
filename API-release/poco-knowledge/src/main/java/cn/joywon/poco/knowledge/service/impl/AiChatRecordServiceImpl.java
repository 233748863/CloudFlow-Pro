package cn.joywon.poco.knowledge.service.impl;

import cn.hutool.core.collection.CollUtil;
import cn.hutool.core.map.MapUtil;
import cn.hutool.core.util.StrUtil;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import cn.joywon.poco.common.core.constant.enums.YesNoEnum;
import cn.joywon.poco.common.core.util.R;
import cn.joywon.poco.knowledge.entity.AiChatRecordEntity;
import cn.joywon.poco.knowledge.entity.AiDatasetEntity;
import cn.joywon.poco.knowledge.mapper.AiChatRecordMapper;
import cn.joywon.poco.knowledge.mapper.AiDatasetMapper;
import cn.joywon.poco.knowledge.service.AiChatRecordService;
import cn.joywon.poco.knowledge.service.EmbeddingStoreService;
import cn.joywon.poco.knowledge.support.constant.DocumentTypeEnums;
import cn.joywon.poco.knowledge.support.constant.LLMUseStatusEnums;
import cn.joywon.poco.knowledge.support.provider.ModelProvider;
import dev.langchain4j.data.document.Metadata;
import dev.langchain4j.data.embedding.Embedding;
import dev.langchain4j.data.segment.TextSegment;
import dev.langchain4j.model.embedding.DimensionAwareEmbeddingModel;
import dev.langchain4j.model.output.Response;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Map;
import java.util.Objects;

/**
 * 聊天记录
 *
 * @author pig
 * @date 2024-07-03 12:39:32
 */
@Service
@RequiredArgsConstructor
public class AiChatRecordServiceImpl extends ServiceImpl<AiChatRecordMapper, AiChatRecordEntity>
		implements AiChatRecordService {

	private final EmbeddingStoreService embeddingStoreService;

	private final AiDatasetMapper datasetMapper;

	private final ModelProvider modelProvider;

	/**
	 * 保存记录
	 * @param map 上下文参数
	 * @param text 文本
	 * @param llmFlag LLM 标志
	 */
	@Override
	public void saveRecord(Map<Object, Object> map, String text, boolean llmFlag) {
		Long messageKey = MapUtil.getLong(map, AiChatRecordEntity.Fields.recordId);
		AiChatRecordEntity recordEntity = baseMapper.selectById(messageKey);
		if (Objects.isNull(recordEntity)) {
			return;
		}
		recordEntity.setAnswerText(text);
		recordEntity.setLlmFlag(llmFlag ? LLMUseStatusEnums.USED.getStatus() : LLMUseStatusEnums.FAILED.getStatus());

		String ip = MapUtil.getStr(map, AiChatRecordEntity.Fields.ip);
		String userAgent = MapUtil.getStr(map, AiChatRecordEntity.Fields.userAgent);
		String username = MapUtil.getStr(map, AiChatRecordEntity.Fields.username);

		recordEntity.setIp(ip);
		recordEntity.setUserAgent(userAgent);
		recordEntity.setUsername(username);
		baseMapper.updateById(recordEntity);
	}

	/**
	 * 更新&标注数据
	 * @param aiChatRecord 聊天记录
	 * @return R
	 */
	@Override
	@Transactional(rollbackFor = Exception.class)
	public R updateAndStandardRecord(AiChatRecordEntity aiChatRecord) {
		AiDatasetEntity aiDatasetEntity = datasetMapper.selectById(aiChatRecord.getDatasetId());
		// 开启了数据标注
		if (StrUtil.isNotBlank(aiChatRecord.getQdrantId())) {
			embeddingStoreService.delete(aiDatasetEntity.getCollectionName(), List.of(aiChatRecord.getQdrantId()));
		}

		DimensionAwareEmbeddingModel embeddingModel = modelProvider
			.getEmbeddingModel(aiDatasetEntity.getEmbeddingModel());
		if (YesNoEnum.YES.getCode().equals(aiChatRecord.getStandardFlag())) {
			Response<Embedding> embeddingResponse = embeddingModel.embed(aiChatRecord.getQuestionText());
			String qdrantId = embeddingStoreService.embeddingStore(aiDatasetEntity.getCollectionName())
				.add(embeddingResponse.content(),
						TextSegment.textSegment(aiChatRecord.getQuestionText(),
								new Metadata(Map.of(DocumentTypeEnums.Fields.type, DocumentTypeEnums.QUESTION.getType(),
										AiChatRecordEntity.Fields.datasetId, aiChatRecord.getDatasetId().toString(),
										AiChatRecordEntity.Fields.answerText, aiChatRecord.getAnswerText(),
										AiChatRecordEntity.Fields.recordId, aiChatRecord.getRecordId().toString()))));
			aiChatRecord.setQdrantId(qdrantId);
		}

		// 更新数据
		baseMapper.updateById(aiChatRecord);
		return R.ok();
	}

	/**
	 * 删除记录和标注
	 * @param ids ids
	 * @return
	 */
	@Override
	@Transactional(rollbackFor = Exception.class)
	public R removeRecordAndStandardByIds(Long[] ids) {
		baseMapper.selectBatchIds(CollUtil.toList(ids)).forEach(aiChatRecordEntity -> {
			AiDatasetEntity aiDatasetEntity = datasetMapper.selectById(aiChatRecordEntity.getDatasetId());
			if (StrUtil.isNotBlank(aiChatRecordEntity.getQdrantId())) {
				embeddingStoreService.delete(aiDatasetEntity.getCollectionName(),
						List.of(aiChatRecordEntity.getQdrantId()));
			}
		});
		baseMapper.deleteByIds(CollUtil.toList(ids));
		return R.ok();
	}

}
