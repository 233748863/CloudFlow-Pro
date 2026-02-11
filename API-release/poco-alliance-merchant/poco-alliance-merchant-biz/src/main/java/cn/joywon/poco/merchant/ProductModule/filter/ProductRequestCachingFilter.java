package cn.joywon.poco.merchant.ProductModule.filter;

import lombok.extern.slf4j.Slf4j;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.util.ContentCachingRequestWrapper;

import jakarta.servlet.*;
import jakarta.servlet.http.HttpServletRequest;
import java.io.IOException;
import java.nio.charset.StandardCharsets;

/**
 * 商品请求日志过滤器
 * 功能：
 * 1. 缓存请求体，使其可以被多次读取（用于异常处理器）
 * 2. 打印请求日志（接口、入参）
 * 
 * @author poco
 * @date 2025-01-23
 */
@Slf4j
@Component
@Order(1)  // 确保在其他过滤器之前执行
public class ProductRequestCachingFilter implements Filter {

    @Override
    public void doFilter(ServletRequest request, ServletResponse response, FilterChain chain)
            throws IOException, ServletException {
        
        if (request instanceof HttpServletRequest) {
            HttpServletRequest httpRequest = (HttpServletRequest) request;
            String uri = httpRequest.getRequestURI();
            String method = httpRequest.getMethod();
            
            // 只对商品相关的 POST/PUT 请求进行包装和日志记录
            if (uri.contains("/merchant/product") && ("POST".equals(method) || "PUT".equals(method))) {
                // 使用 ContentCachingRequestWrapper 包装请求，使请求体可以被多次读取
                ContentCachingRequestWrapper wrappedRequest = new ContentCachingRequestWrapper(httpRequest);
                
                // 继续过滤器链（让 Controller 处理请求）
                chain.doFilter(wrappedRequest, response);
                
                // 处理完成后打印日志
                log.info("========== 商品请求 ==========");
                log.info("接口: {} {}", method, uri);
                
                // 读取缓存的请求体
                byte[] content = wrappedRequest.getContentAsByteArray();
                if (content.length > 0) {
                    String requestBody = new String(content, StandardCharsets.UTF_8);
                    log.info("入参: {}", requestBody);
                }
                log.info("================================");
                
                return;
            }
        }
        
        // 非商品请求，直接放行
        chain.doFilter(request, response);
    }
}
