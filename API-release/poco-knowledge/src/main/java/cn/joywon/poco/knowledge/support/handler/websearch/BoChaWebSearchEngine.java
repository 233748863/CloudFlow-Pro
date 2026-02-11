package cn.joywon.poco.knowledge.support.handler.websearch;

import dev.langchain4j.web.search.*;
import io.github.pigmesh.ai.deepseek.core.search.SearchResponse;

import java.net.URI;
import java.time.Duration;
import java.util.Arrays;
import java.util.List;
import java.util.Objects;

import static dev.langchain4j.internal.Utils.getOrDefault;
import static dev.langchain4j.internal.ValidationUtils.ensureNotNull;
import static java.net.HttpURLConnection.HTTP_OK;

/**
 * BO CHA 网络搜索引擎
 *
 * @author poco
 * @date 2025/02/24
 */
public class BoChaWebSearchEngine implements WebSearchEngine {

    private final BoChaClient boChaClient;

    private BoChaWebSearchEngine(BoChaWebSearchEngine.Builder builder) {
        ensureNotNull(builder.baseUrl, "baseUrl");
        this.boChaClient = new BoChaClient(builder.baseUrl, builder.apiKey,
                getOrDefault(builder.duration, Duration.ofSeconds(10L)));
    }

    public static BoChaWebSearchEngine.Builder builder() {
        return new BoChaWebSearchEngine.Builder();
    }

    /**
     * Performs a search query on the web search engine and returns the search results.
     *
     * @param query the search query
     * @return the search results
     */
    @Override
    public WebSearchResults search(String query) {
        return WebSearchEngine.super.search(query);
    }

    /**
     * Performs a search request on the web search engine and returns the search results.
     *
     * @param webSearchRequest the search request
     * @return the web search results
     */
    @Override
    public WebSearchResults search(WebSearchRequest webSearchRequest) {
        final SearchResponse results = boChaClient.search(webSearchRequest);

        if (HTTP_OK != results.getCode()) {
            return null;
        }

        SearchResponse.WebPages webPages = results.getData().getWebPages();
        List<WebSearchOrganicResult> webSearchOrganicResults = Arrays.stream(webPages.getValue())
                .map(value -> WebSearchOrganicResult.from(value.getName(), URI.create(value.getUrl()), value.getSnippet(),
                        value.getSummary()))
                .toList();
        return WebSearchResults.from(WebSearchInformationResult.from(
                        Objects.requireNonNullElse(webPages.getTotalEstimatedMatches(), 0L).longValue()),
                webSearchOrganicResults
        );
    }

    public static class Builder {

        private String baseUrl;

        private String apiKey;

        private Duration duration;

        public BoChaWebSearchEngine.Builder baseUrl(String baseUrl) {
            this.baseUrl = baseUrl;
            return this;
        }

        public BoChaWebSearchEngine.Builder apiKey(String apiKey) {
            this.apiKey = apiKey;
            return this;
        }

        public BoChaWebSearchEngine.Builder duration(Duration duration) {
            this.duration = duration;
            return this;
        }

        public BoChaWebSearchEngine build() {
            return new BoChaWebSearchEngine(this);
        }

    }

}
