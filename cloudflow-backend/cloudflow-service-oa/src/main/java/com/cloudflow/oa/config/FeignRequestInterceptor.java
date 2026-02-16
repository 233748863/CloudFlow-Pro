package com.cloudflow.oa.config;

import feign.RequestInterceptor;
import feign.RequestTemplate;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

/**
 * Feign 请求拦截器
 * <p>
 * 在 OA 服务通过 Feign 调用其他微服务时，
 * 自动将当前请求中的用户认证相关请求头透传给下游服务，
 * 确保下游服务的 SecurityContextFilter 能正确识别用户身份。
 * </p>
 */
@Configuration
public class FeignRequestInterceptor implements RequestInterceptor {

    /** 需要透传的请求头列表 */
    private static final String[] HEADERS_TO_PROPAGATE = {
            "X-User-Id",
            "X-User-Name",
            "X-User-Roles",
            "X-User-Dept-Id",
            "X-User-Tenant-Id",
            "Authorization"
    };

    @Override
    public void apply(RequestTemplate template) {
        ServletRequestAttributes attributes =
                (ServletRequestAttributes) RequestContextHolder.getRequestAttributes();
        if (attributes == null) {
            return;
        }

        HttpServletRequest request = attributes.getRequest();
        for (String header : HEADERS_TO_PROPAGATE) {
            String value = request.getHeader(header);
            if (value != null) {
                template.header(header, value);
            }
        }
    }
}
