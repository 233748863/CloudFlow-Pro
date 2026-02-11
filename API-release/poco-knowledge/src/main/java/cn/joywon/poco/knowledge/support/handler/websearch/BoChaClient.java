package cn.joywon.poco.knowledge.support.handler.websearch;

import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import dev.langchain4j.web.search.WebSearchRequest;
import io.github.pigmesh.ai.deepseek.core.AuthorizationHeaderInjector;
import io.github.pigmesh.ai.deepseek.core.search.SearchApi;
import io.github.pigmesh.ai.deepseek.core.search.SearchRequest;
import io.github.pigmesh.ai.deepseek.core.search.SearchResponse;
import okhttp3.OkHttpClient;
import retrofit2.Response;
import retrofit2.Retrofit;
import retrofit2.converter.jackson.JacksonConverterFactory;

import java.io.IOException;
import java.time.Duration;

/**
 * @author poco
 * @date 2025/2/24
 */
public class BoChaClient {

	public static final ObjectMapper OBJECT_MAPPER = new ObjectMapper()
		.configure(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false)
		.enable(SerializationFeature.INDENT_OUTPUT);

	private final SearchApi api;

	public BoChaClient(String baseUrl, String apiKey, Duration timeout) {
		OkHttpClient.Builder okHttpClientBuilder = new OkHttpClient.Builder().callTimeout(timeout)
			.addInterceptor(new AuthorizationHeaderInjector(apiKey))
			.connectTimeout(timeout)
			.readTimeout(timeout)
			.writeTimeout(timeout);

		Retrofit retrofit = new Retrofit.Builder().baseUrl(baseUrl)
			.client(okHttpClientBuilder.build())
			.addConverterFactory(JacksonConverterFactory.create(OBJECT_MAPPER))
			.build();
		this.api = retrofit.create(SearchApi.class);
	}

	/**
	 * 搜索
	 * @param request 请求
	 * @return {@link SearchResponse }
	 */
	SearchResponse search(WebSearchRequest request) {
		try {
			final Response<SearchResponse> response = api
				.webSearch(SearchRequest.builder().query(request.searchTerms()).count(request.maxResults()).build())
				.execute();
			return response.body();
		}
		catch (IOException e) {
			throw new RuntimeException(e);
		}
	}

}
