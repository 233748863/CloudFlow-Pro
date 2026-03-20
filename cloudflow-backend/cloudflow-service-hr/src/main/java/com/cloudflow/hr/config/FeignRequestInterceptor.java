package com.cloudflow.hr.config;
import com.cloudflow.common.core.context.UserContext;

import cn.dev33.satoken.stp.StpUtil;
import feign.RequestInterceptor;
import feign.RequestTemplate;
import jakarta.servlet.http.HttpServletRequest;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;


/**
 * Feign请求拦截器
 * 用于在Feign请求中传递租户信息、用户Token等上下文信息
 *
 * @author CloudFlow
 * @since 1.0.0
 */
@Slf4j
@Component
public class FeignRequestInterceptor implements RequestInterceptor {
    
    /**
     * 租户ID请求头名称
     */
    private static final String TENANT_ID_HEADER = "X-Tenant-Id";
    
    /**
     * 用户ID请求头名称
     */
    private static final String USER_ID_HEADER = "X-User-Id";
    
    /**
     * Token请求头名称
     */
    private static final String AUTHORIZATION_HEADER = "Authorization";
    
    @Override
    public void apply(RequestTemplate template) {
        // 1. 传递租户ID
        Long tenantId = UserContext.getTenantId();
        if (tenantId != null) {
            template.header(TENANT_ID_HEADER, String.valueOf(tenantId));
            log.debug("Feign请求传递租户ID: {}", tenantId);
        }
        
        // 2. 传递用户ID
        try {
            if (StpUtil.isLogin()) {
                Long userId = StpUtil.getLoginIdAsLong();
                template.header(USER_ID_HEADER, String.valueOf(userId));
                log.debug("Feign请求传递用户ID: {}", userId);
            }
        } catch (Exception e) {
            log.debug("获取用户ID失败，可能未登录: {}", e.getMessage());
        }
        
        // 3. 传递Token
        ServletRequestAttributes attributes = (ServletRequestAttributes) RequestContextHolder.getRequestAttributes();
        if (attributes != null) {
            HttpServletRequest request = attributes.getRequest();
            String token = request.getHeader(AUTHORIZATION_HEADER);
            if (token != null && !token.isEmpty()) {
                template.header(AUTHORIZATION_HEADER, token);
                log.debug("Feign请求传递Token");
            }
        }
        
        // 4. 传递其他必要的请求头（如果需要）
        // 例如：trace-id、request-id等
    }
}
