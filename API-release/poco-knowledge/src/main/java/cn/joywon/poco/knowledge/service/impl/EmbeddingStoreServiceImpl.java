package cn.joywon.poco.knowledge.service.impl;

import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import cn.joywon.poco.knowledge.entity.AiDatasetEntity;
import cn.joywon.poco.knowledge.entity.AiEmbedStoreEntity;
import cn.joywon.poco.knowledge.mapper.AiDatasetMapper;
import cn.joywon.poco.knowledge.mapper.AiEmbedStoreMapper;
import cn.joywon.poco.knowledge.service.EmbeddingStoreService;
import cn.joywon.poco.knowledge.support.handler.rag.EmbeddingStoreFactory;
import dev.langchain4j.data.segment.TextSegment;
import dev.langchain4j.store.embedding.EmbeddingStore;
import dev.langchain4j.store.embedding.inmemory.InMemoryEmbeddingStore;
import lombok.RequiredArgsConstructor;
import lombok.SneakyThrows;
import org.springframework.stereotype.Service;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

/**
 * @author poco
 * @date 2024/9/26
 * <p>
 * 根据不同的集合名称，获取不同的嵌入存储
 */
@Service
@RequiredArgsConstructor
public class EmbeddingStoreServiceImpl implements EmbeddingStoreService {

	private final static Map<String, EmbeddingStore<TextSegment>> EMBEDDING_STORE_MAP = new HashMap<>();

	private final Map<String, EmbeddingStoreFactory> embeddingStoreFactoryMap;

	private final AiEmbedStoreMapper aiEmbedStoreMapper;

	private final AiDatasetMapper aiDatasetMapper;

	/**
	 * 嵌入存储
	 * @param collectionName 集合名称
	 * @return {@link EmbeddingStore }<{@link TextSegment }>
	 */
	@Override
	@SneakyThrows
	public EmbeddingStore<TextSegment> embeddingStore(String collectionName) {
		EmbeddingStore<TextSegment> embeddingStore = EMBEDDING_STORE_MAP.get(collectionName);

		if (Objects.nonNull(embeddingStore)) {
			return embeddingStore;
		}

		// 根据ID 查询知识库
		AiDatasetEntity aiDatasetEntity = aiDatasetMapper
			.selectOne(Wrappers.<AiDatasetEntity>lambdaQuery().eq(AiDatasetEntity::getCollectionName, collectionName));
		AiEmbedStoreEntity embedStoreEntity = aiEmbedStoreMapper.selectOne(Wrappers.<AiEmbedStoreEntity>lambdaQuery()
			.eq(AiEmbedStoreEntity::getStoreId, aiDatasetEntity.getStoreId()), false);

		// 没有配置信息，使用内存存储
		if (Objects.isNull(embedStoreEntity)) {
			embeddingStore = new InMemoryEmbeddingStore<>();
		}

		for (EmbeddingStoreFactory storeFactory : embeddingStoreFactoryMap.values()) {
			if (storeFactory.support(embedStoreEntity.getStoreType())) {
				embeddingStore = storeFactory.createEmbeddingStore(embedStoreEntity, aiDatasetEntity);
				break;
			}
		}

		EMBEDDING_STORE_MAP.put(collectionName, embeddingStore);
		return embeddingStore;
	}

	/**
	 * 删除嵌入存储
	 *
	 * @param name 名字
	 */
	@Override
	public void deleteEmbeddingStore(String name) {
		EMBEDDING_STORE_MAP.remove(name);
	}

	/**
	 * 删除
	 * @param collectionName 集合名称
	 * @param idList ID 列表
	 */
	@Override
	@SneakyThrows
	public void delete(String collectionName, List<String> idList) {
		this.embeddingStore(collectionName).removeAll(idList);
	}

}
