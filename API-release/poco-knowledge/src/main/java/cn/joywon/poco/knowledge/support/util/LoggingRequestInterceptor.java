package cn.joywon.poco.knowledge.support.util;

import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpRequest;
import org.springframework.http.client.ClientHttpRequestExecution;
import org.springframework.http.client.ClientHttpRequestInterceptor;
import org.springframework.http.client.ClientHttpResponse;
import org.springframework.util.StreamUtils;

import java.io.IOException;
import java.nio.charset.StandardCharsets;

/**
 * LoggingRequestInterceptor
 *
 * @author poco
 * @date 2024/4/24
 */
@Slf4j
public class LoggingRequestInterceptor implements ClientHttpRequestInterceptor {

	public LoggingRequestInterceptor() {
	}

	public ClientHttpResponse intercept(HttpRequest request, byte[] body, ClientHttpRequestExecution execution)
			throws IOException {
		traceRequest(request, body);
		ClientHttpResponse response = execution.execute(request, body);
		traceResponse(response);
		return response;
	}

	private void traceRequest(HttpRequest request, byte[] body) throws IOException {
		log.info("===========================request begin================================================");
		log.info("URI         : {}", request.getURI());
		log.info("Method      : {}", request.getMethod());
		log.info("Headers     : {}", request.getHeaders());
		log.info("Request body: {}", new String(body, StandardCharsets.UTF_8));
		log.info("==========================request end================================================");
	}

	private void traceResponse(ClientHttpResponse response) throws IOException {
		log.info("============================response begin==========================================");
		log.info("Status code  : {}", response.getStatusCode());
		log.info("Status text  : {}", response.getStatusText());
		log.info("Headers      : {}", response.getHeaders());
		log.debug("Response body: {}", StreamUtils.copyToString(response.getBody(), StandardCharsets.UTF_8));
		log.info("=======================response end=================================================");
	}

}
