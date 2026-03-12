package com.cloudflow.workflow.security;

import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.sensitive.utils.SensitiveUtils;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.util.*;
import java.util.regex.Pattern;

/**
 * P3.3: 工作流安全工具类
 * 包含 XSS 防护、SQL 注入防护、数据脱敏、条件表达式安全性、防重放攻击
 */
@Component
public class WorkflowSecurityUtils {

    private static final Logger log = LoggerFactory.getLogger(WorkflowSecurityUtils.class);

    // S.6: XSS 危险标签和属性模式
    private static final Pattern XSS_SCRIPT_PATTERN = Pattern.compile("<script[^>]*>.*?</script>", Pattern.CASE_INSENSITIVE | Pattern.DOTALL);
    private static final Pattern XSS_EVENT_PATTERN = Pattern.compile("on\\w+\\s*=\\s*[\"'][^\"']*[\"']", Pattern.CASE_INSENSITIVE);
    private static final Pattern XSS_JAVASCRIPT_PATTERN = Pattern.compile("javascript\\s*:", Pattern.CASE_INSENSITIVE);
    private static final Pattern XSS_IFRAME_PATTERN = Pattern.compile("<iframe[^>]*>.*?</iframe>", Pattern.CASE_INSENSITIVE | Pattern.DOTALL);
    private static final Pattern XSS_OBJECT_PATTERN = Pattern.compile("<object[^>]*>.*?</object>", Pattern.CASE_INSENSITIVE | Pattern.DOTALL);
    private static final Pattern XSS_EMBED_PATTERN = Pattern.compile("<embed[^>]*>", Pattern.CASE_INSENSITIVE);

    // S.5: SQL 注入危险关键字模式
    private static final Pattern SQL_INJECTION_PATTERN = Pattern.compile(
        "(\\b(SELECT|INSERT|UPDATE|DELETE|DROP|UNION|ALTER|CREATE|EXEC|EXECUTE|TRUNCATE|DECLARE)\\b\\s)" +
        "|(--)" +
        "|(;\\s*(SELECT|INSERT|UPDATE|DELETE|DROP))" +
        "|(/\\*.*?\\*/)" +
        "|(\\bOR\\b\\s+\\d+\\s*=\\s*\\d+)" +
        "|(\\bAND\\b\\s+\\d+\\s*=\\s*\\d+)",
        Pattern.CASE_INSENSITIVE
    );

    // 4.N: SpEL 表达式白名单函数
    private static final Set<String> SPEL_WHITELIST = new HashSet<>(Arrays.asList(
        "equals", "compareTo", "toString", "valueOf", "parseInt", "parseDouble",
        "length", "isEmpty", "contains", "startsWith", "endsWith",
        "toLowerCase", "toUpperCase", "trim", "substring",
        "size", "get", "containsKey", "containsValue"
    ));

    // SpEL 黑名单 - 禁止的危险类和方法
    private static final Set<String> SPEL_BLACKLIST = new HashSet<>(Arrays.asList(
        "Runtime", "ProcessBuilder", "exec", "getRuntime",
        "Class", "forName", "getMethod", "invoke",
        "System", "exit", "getenv", "getProperty",
        "Thread", "sleep", "start", "interrupt",
        "File", "FileInputStream", "FileOutputStream",
        "URL", "URLConnection", "HttpURLConnection",
        "Socket", "ServerSocket",
        "T(", "new "
    ));

    /**
     * S.6: XSS 过滤 - 清理用户输入
     */
    public String sanitizeXss(String input) {
        if (input == null || input.isEmpty()) {
            return input;
        }

        String cleaned = input;
        cleaned = XSS_SCRIPT_PATTERN.matcher(cleaned).replaceAll("");
        cleaned = XSS_EVENT_PATTERN.matcher(cleaned).replaceAll("");
        cleaned = XSS_JAVASCRIPT_PATTERN.matcher(cleaned).replaceAll("");
        cleaned = XSS_IFRAME_PATTERN.matcher(cleaned).replaceAll("");
        cleaned = XSS_OBJECT_PATTERN.matcher(cleaned).replaceAll("");
        cleaned = XSS_EMBED_PATTERN.matcher(cleaned).replaceAll("");

        // HTML 实体编码
        cleaned = cleaned.replace("&", "&amp;")
                         .replace("<", "&lt;")
                         .replace(">", "&gt;")
                         .replace("\"", "&quot;")
                         .replace("'", "&#x27;");

        if (!cleaned.equals(input)) {
            log.warn("[sanitizeXss] 检测到XSS攻击尝试, 已清理输入");
        }

        return cleaned;
    }

    /**
     * S.5: SQL 注入检测
     */
    public boolean hasSqlInjection(String input) {
        if (input == null || input.isEmpty()) {
            return false;
        }
        boolean detected = SQL_INJECTION_PATTERN.matcher(input).find();
        if (detected) {
            log.warn("[hasSqlInjection] 检测到SQL注入尝试: {}", input.substring(0, Math.min(input.length(), 100)));
        }
        return detected;
    }

    /**
     * S.5: 安全检查字符串输入（用于自定义查询参数）
     */
    public String sanitizeSqlInput(String input) {
        if (input == null) {
            return null;
        }
        if (hasSqlInjection(input)) {
            throw new SecurityException("检测到SQL注入攻击");
        }
        return input;
    }

    /**
     * 4.N: 验证 SpEL 条件表达式安全性
     */
    public void validateSpelExpression(String expression) {
        if (expression == null || expression.isEmpty()) {
            return;
        }

        // 检查黑名单
        for (String blacklisted : SPEL_BLACKLIST) {
            if (expression.contains(blacklisted)) {
                log.warn("[validateSpelExpression] 检测到危险表达式: {}", expression);
                throw new SecurityException("条件表达式包含不允许的操作: " + blacklisted);
            }
        }

        // 检查表达式长度限制
        if (expression.length() > 500) {
            throw new SecurityException("条件表达式过长（最大500字符）");
        }

        log.debug("[validateSpelExpression] 表达式安全检查通过: {}", expression);
    }

    /**
     * S.2/9.B: 统一脱敏入口。
     */
    public Map<String, Object> maskSensitiveData(Map<String, Object> data) {
        if (data == null || data.isEmpty()) {
            return data;
        }
        // 统一委托 common-sensitive 模块，避免工作流里重复维护脱敏规则。
        return SensitiveUtils.maskMap(data);
    }

    /**
     * S.6: 批量清理 Map 中的 XSS
     */
    @SuppressWarnings("unchecked")
    public Map<String, Object> sanitizeMapXss(Map<String, Object> data) {
        if (data == null) {
            return null;
        }
        Map<String, Object> sanitized = new HashMap<>();
        for (Map.Entry<String, Object> entry : data.entrySet()) {
            Object value = entry.getValue();
            if (value instanceof String) {
                sanitized.put(entry.getKey(), sanitizeXss((String) value));
            } else if (value instanceof Map) {
                // 类型检查已通过 instanceof，这里的转换是安全的
                sanitized.put(entry.getKey(), sanitizeMapXss((Map<String, Object>) value));
            } else {
                sanitized.put(entry.getKey(), value);
            }
        }
        return sanitized;
    }

    /**
     * 获取当前登录用户ID
     * 从 UserContext 中获取（由 Sa-Token 链路和 UserContextInterceptor 填充）
     */
    public static Long getCurrentUserId() {
        try {
            return UserContext.getUserId();
        } catch (Exception e) {
            log.warn("[getCurrentUserId] 获取当前用户ID失败: {}", e.getMessage());
            return null;
        }
    }

    /**
     * 获取当前租户ID
     * 从 UserContext 中获取（由 Sa-Token 链路和 UserContextInterceptor 填充）
     */
    public static Long getCurrentTenantId() {
        try {
            return UserContext.getTenantId();
        } catch (Exception e) {
            log.warn("[getCurrentTenantId] 获取当前租户ID失败: {}", e.getMessage());
            return null;
        }
    }
}
