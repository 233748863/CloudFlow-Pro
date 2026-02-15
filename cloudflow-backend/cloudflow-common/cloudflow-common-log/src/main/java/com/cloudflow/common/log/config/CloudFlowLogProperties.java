package com.cloudflow.common.log.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;

import java.util.Arrays;
import java.util.List;

/**
 * 操作日志配置属性
 * <p>
 * 配置示例（application.yml）：
 * <pre>
 * cloudflow:
 *   log:
 *     enabled: true
 *     request-enabled: true
 *     max-length: 2000
 *     exclude-fields:
 *       - password
 *       - token
 * </pre>
 *
 * @author CloudFlow
 */
@Data
@ConfigurationProperties(prefix = "cloudflow.log")
public class CloudFlowLogProperties {

    /** 是否开启操作日志记录，默认开启 */
    private boolean enabled = true;

    /** 是否记录请求报文体，默认开启 */
    private boolean requestEnabled = true;

    /** 请求参数最大记录长度，超出截断 */
    private int maxLength = 2000;

    /** 需要排除的敏感字段名列表（序列化时自动脱敏） */
    private List<String> excludeFields = Arrays.asList(
            "password", "secret", "token", "accessToken", "refreshToken",
            "mobile", "idcard", "creditCard"
    );
}
