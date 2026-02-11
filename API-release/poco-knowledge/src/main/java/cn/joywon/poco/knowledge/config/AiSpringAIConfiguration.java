package cn.joywon.poco.knowledge.config;

import cn.joywon.poco.common.core.factory.YamlPropertySourceFactory;
import cn.joywon.poco.knowledge.config.properties.AiKnowledgeProperties;
import cn.joywon.poco.knowledge.service.AiMarkitdownAssistantService;
import cn.joywon.poco.knowledge.service.AiOCRAssistantService;
import cn.joywon.poco.knowledge.service.MiIotHomeAssistantService;
import org.springframework.ai.tokenizer.JTokkitTokenCountEstimator;
import org.springframework.ai.tokenizer.TokenCountEstimator;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.PropertySource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.support.RestClientAdapter;
import org.springframework.web.service.invoker.HttpServiceProxyFactory;

/**
 * AI Spring AI 配置
 *
 * @author poco
 * @date 2024/08/08
 */
@Configuration(proxyBeanMethods = false)
@PropertySource(value = "classpath:lowcode/magic-api.yml", factory = YamlPropertySourceFactory.class)
@EnableConfigurationProperties({ AiKnowledgeProperties.class })
public class AiSpringAIConfiguration {

	/**
	 * 令牌计数估计器
	 * @return {@link TokenCountEstimator }
	 */
	@Bean
	@ConditionalOnMissingBean
	public TokenCountEstimator tokenCountEstimator() {
		return new JTokkitTokenCountEstimator();
	}

	/**
	 * AI OCRApp 服务
	 * @param properties 性能
	 * @return {@link AiOCRAssistantService }
	 */
	@Bean
	public AiOCRAssistantService aiOCRAssistantService(AiKnowledgeProperties properties) {
		RestClient restClient = RestClient.builder().baseUrl(properties.getCnocr().getBaseUrl()).build();
		HttpServiceProxyFactory factory = HttpServiceProxyFactory.builderFor(RestClientAdapter.create(restClient))
			.build();
		return factory.createClient(AiOCRAssistantService.class);
	}

	/**
	 * 家居助理服务
	 * @param restClientBuilder REST 客户端构建器
	 * @param knowledgeProperties 配置
	 * @return {@link MiIotHomeAssistantService }
	 */
	@Bean
	public MiIotHomeAssistantService homeAssistantService(RestClient.Builder restClientBuilder,
			AiKnowledgeProperties knowledgeProperties) {
		RestClient client = restClientBuilder.requestFactory(new JdkClientHttpRequestFactory())
			.baseUrl(knowledgeProperties.getMiIot().getBaseUrl())
			.defaultHeader(HttpHeaders.AUTHORIZATION,
					String.format("Bearer %s", knowledgeProperties.getMiIot().getApiKey()))
			.build();

		HttpServiceProxyFactory factory = HttpServiceProxyFactory.builderFor(RestClientAdapter.create(client)).build();
		return factory.createClient(MiIotHomeAssistantService.class);
	}

	/**
	 * Markitdown Assistant 服务
	 * @param restClientBuilder REST 客户端构建器
	 * @param knowledgeProperties 知识属性
	 * @return {@link AiMarkitdownAssistantService }
	 */
	@Bean
	public AiMarkitdownAssistantService markitdownAssistantService(RestClient.Builder restClientBuilder,
			AiKnowledgeProperties knowledgeProperties) {
		RestClient client = restClientBuilder.requestFactory(new JdkClientHttpRequestFactory())
			.baseUrl(knowledgeProperties.getMarkitdown().getBaseUrl())
			.build();

		HttpServiceProxyFactory factory = HttpServiceProxyFactory.builderFor(RestClientAdapter.create(client)).build();
		return factory.createClient(AiMarkitdownAssistantService.class);
	}

}
