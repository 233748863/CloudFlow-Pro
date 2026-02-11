package cn.joywon.poco.common.feign.interceptor;

import feign.RequestInterceptor;
import org.springframework.http.HttpHeaders;

/**
 * @author poco
 * @date 2024/3/15
 * <p>
 * http connection close
 */
public class PocoFeignRequestCloseInterceptor implements RequestInterceptor {

	/**
	 * set connection close
	 * @param template
	 */
	@Override
	public void apply(feign.RequestTemplate template) {
		template.header(HttpHeaders.CONNECTION, "close");
	}

}
