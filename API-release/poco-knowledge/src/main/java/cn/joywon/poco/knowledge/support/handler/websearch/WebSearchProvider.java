package cn.joywon.poco.knowledge.support.handler.websearch;

import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import cn.joywon.poco.common.core.constant.enums.YesNoEnum;
import cn.joywon.poco.knowledge.config.properties.AiKnowledgeProperties;
import cn.joywon.poco.knowledge.entity.AiModelEntity;
import cn.joywon.poco.knowledge.mapper.AiModelMapper;
import cn.joywon.poco.knowledge.support.constant.WebSearchEnums;
import dev.langchain4j.community.web.search.searxng.SearXNGWebSearchEngine;
import dev.langchain4j.data.document.Document;
import dev.langchain4j.web.search.WebSearchEngine;
import dev.langchain4j.web.search.WebSearchRequest;
import dev.langchain4j.web.search.WebSearchResults;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.util.HashMap;
import java.util.Map;
import java.util.Objects;
import java.util.stream.Collectors;

/**
 * websearch 初始化程序
 *
 * @author poco
 * @date 2025/2/24
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class WebSearchProvider {

	private final AiModelMapper aiModelMapper;

	private final AiKnowledgeProperties aiKnowledgeProperties;

	/**
	 * 网络搜索引擎
	 */
	public static Map<String, WebSearchEngine> webSearchEngineMap = new HashMap<>();

	/**
	 * 搜索
	 * @param query 查询
	 * @return {@link String } 搜索结果
	 */
	public String search(String query) {

		AiModelEntity searchModel = aiModelMapper.selectOne(Wrappers.<AiModelEntity>lambdaQuery()
			.eq(AiModelEntity::getModelType, WebSearchEnums.BOCHA.getType())
			.eq(AiModelEntity::getDefaultModel, YesNoEnum.YES.getCode()), false);

		if (Objects.isNull(searchModel)) {
			log.warn("未找到默认搜索引擎，请配置");
			return null;
		}

		// 初始化 SEARXNG 搜索引擎
		if (searchModel.getModelName().equals(WebSearchEnums.SEARXNG.getName())) {
			WebSearchEngine webSearchEngine = webSearchEngineMap.getOrDefault(WebSearchEnums.SEARXNG.getName(),
					SearXNGWebSearchEngine.builder()
						.baseUrl(searchModel.getBaseUrl())
						.duration(Duration.ofSeconds(aiKnowledgeProperties.getWebSearch().getDuration()))
						.build());

			webSearchEngineMap.put(WebSearchEnums.SEARXNG.getName(), webSearchEngine);
			WebSearchResults searchResults = webSearchEngine.search(WebSearchRequest.builder()
				.searchTerms(query)
				.maxResults(aiKnowledgeProperties.getWebSearch().getMaxResults())
				.build());
			return searchResults.toDocuments().stream().map(Document::text).collect(Collectors.joining());
		}

		if (searchModel.getModelName().equals(WebSearchEnums.BOCHA.getName())) {
			WebSearchEngine webSearchEngine = webSearchEngineMap.getOrDefault(WebSearchEnums.BOCHA.getName(),
					BoChaWebSearchEngine.builder()
						.baseUrl(searchModel.getBaseUrl())
						.apiKey(searchModel.getApiKey())
						.duration(Duration.ofSeconds(aiKnowledgeProperties.getWebSearch().getDuration()))
						.build());

			webSearchEngineMap.put(WebSearchEnums.BOCHA.getName(), webSearchEngine);
			WebSearchResults searchResults = webSearchEngine.search(WebSearchRequest.builder()
				.searchTerms(query)
				.maxResults(aiKnowledgeProperties.getWebSearch().getMaxResults())
				.build());
			return searchResults.toDocuments().stream().map(Document::text).collect(Collectors.joining());
		}

		return null;
	}

}
