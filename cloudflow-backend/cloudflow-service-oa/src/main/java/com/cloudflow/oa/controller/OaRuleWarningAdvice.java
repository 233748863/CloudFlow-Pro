package com.cloudflow.oa.controller;

import com.cloudflow.common.core.domain.R;
import com.cloudflow.oa.service.impl.OaBusinessRuleService;
import org.springframework.core.MethodParameter;
import org.springframework.http.MediaType;
import org.springframework.http.converter.HttpMessageConverter;
import org.springframework.http.server.ServerHttpRequest;
import org.springframework.http.server.ServerHttpResponse;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.context.request.RequestAttributes;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.servlet.mvc.method.annotation.ResponseBodyAdvice;
import java.util.List;
import java.util.stream.Collectors;

@RestControllerAdvice(basePackages = "com.cloudflow.oa.controller")
public class OaRuleWarningAdvice implements ResponseBodyAdvice<Object> {
    @Override
    public boolean supports(MethodParameter returnType, Class<? extends HttpMessageConverter<?>> converterType) {
        return R.class.isAssignableFrom(returnType.getParameterType());
    }

    @Override
    public Object beforeBodyWrite(Object body, MethodParameter returnType, MediaType mediaType,
            Class<? extends HttpMessageConverter<?>> converterType, ServerHttpRequest request, ServerHttpResponse response) {
        RequestAttributes attributes = RequestContextHolder.getRequestAttributes();
        if (body instanceof R<?> result && result.isSuccess() && attributes != null) {
            Object stored = attributes.getAttribute(OaBusinessRuleService.WARNINGS_ATTRIBUTE, RequestAttributes.SCOPE_REQUEST);
            if (stored instanceof List<?> warnings && !warnings.isEmpty()) {
                result.setMsg("操作成功；业务规则提醒：" + warnings.stream().map(String::valueOf).collect(Collectors.joining("；")));
                response.getHeaders().add("X-OA-Rule-Warning", "true");
            }
        }
        return body;
    }
}
