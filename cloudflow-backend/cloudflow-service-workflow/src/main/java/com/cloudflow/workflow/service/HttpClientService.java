package com.cloudflow.workflow.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.hc.client5.http.classic.methods.*;
import org.apache.hc.client5.http.impl.classic.CloseableHttpClient;
import org.apache.hc.client5.http.impl.classic.HttpClients;
import org.apache.hc.core5.http.ClassicHttpResponse;
import org.apache.hc.core5.http.ContentType;
import org.apache.hc.core5.http.HttpEntity;
import org.apache.hc.core5.http.io.HttpClientResponseHandler;
import org.apache.hc.core5.http.io.entity.EntityUtils;
import org.apache.hc.core5.http.io.entity.StringEntity;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.util.Map;

/**
 * HTTP 客户端服务
 * 用于执行 HTTP API 调用
 */
@Service
public class HttpClientService {
    
    private static final Logger log = LoggerFactory.getLogger(HttpClientService.class);
    private final ObjectMapper objectMapper = new ObjectMapper();
    
    /**
     * 执行 HTTP 请求
     * 
     * @param url API URL
     * @param method HTTP 方法 (GET, POST, PUT, DELETE)
     * @param headers 请求头
     * @param body 请求体（JSON 格式）
     * @return API 响应结果
     */
    public ApiResponse executeRequest(String url, String method, Map<String, String> headers, Map<String, Object> body) {
        try (CloseableHttpClient httpClient = HttpClients.createDefault()) {
            log.info("[executeRequest] 执行 HTTP 请求, method={}, url={}", method, url);
            
            // 创建请求对象
            HttpUriRequestBase request = createRequest(method, url);
            
            // 设置请求头
            if (headers != null) {
                headers.forEach(request::setHeader);
            }
            
            // 设置请求体（仅对 POST, PUT, PATCH）
            if (body != null && (request instanceof HttpPost || request instanceof HttpPut || request instanceof HttpPatch)) {
                String jsonBody = objectMapper.writeValueAsString(body);
                StringEntity entity = new StringEntity(jsonBody, ContentType.APPLICATION_JSON);
                
                if (request instanceof HttpPost) {
                    ((HttpPost) request).setEntity(entity);
                } else if (request instanceof HttpPut) {
                    ((HttpPut) request).setEntity(entity);
                } else if (request instanceof HttpPatch) {
                    ((HttpPatch) request).setEntity(entity);
                }
            }
            
            // 使用 ResponseHandler 执行请求（推荐方式）
            HttpClientResponseHandler<ApiResponse> responseHandler = response -> {
                int statusCode = response.getCode();
                HttpEntity entity = response.getEntity();
                String responseBody = "";
                
                if (entity != null) {
                    try {
                        responseBody = EntityUtils.toString(entity);
                    } catch (org.apache.hc.core5.http.ParseException e) {
                        log.warn("解析响应体失败: {}", e.getMessage());
                        responseBody = "解析响应失败";
                    }
                }
                
                log.info("[executeRequest] HTTP 请求完成, statusCode={}", statusCode);
                
                return new ApiResponse(statusCode, responseBody, statusCode >= 200 && statusCode < 300);
            };
            
            return httpClient.execute(request, responseHandler);
            
        } catch (Exception e) {
            log.error("[executeRequest] HTTP 请求失败: {}", e.getMessage(), e);
            return new ApiResponse(500, "请求失败: " + e.getMessage(), false);
        }
    }
    
    /**
     * 创建 HTTP 请求对象
     */
    private HttpUriRequestBase createRequest(String method, String url) {
        switch (method.toUpperCase()) {
            case "GET":
                return new HttpGet(url);
            case "POST":
                return new HttpPost(url);
            case "PUT":
                return new HttpPut(url);
            case "DELETE":
                return new HttpDelete(url);
            case "PATCH":
                return new HttpPatch(url);
            case "HEAD":
                return new HttpHead(url);
            case "OPTIONS":
                return new HttpOptions(url);
            default:
                throw new IllegalArgumentException("不支持的 HTTP 方法: " + method);
        }
    }
    
    /**
     * API 响应结果
     */
    public static class ApiResponse {
        private final int statusCode;
        private final String body;
        private final boolean success;
        
        public ApiResponse(int statusCode, String body, boolean success) {
            this.statusCode = statusCode;
            this.body = body;
            this.success = success;
        }
        
        public int getStatusCode() {
            return statusCode;
        }
        
        public String getBody() {
            return body;
        }
        
        public boolean isSuccess() {
            return success;
        }
    }
}
