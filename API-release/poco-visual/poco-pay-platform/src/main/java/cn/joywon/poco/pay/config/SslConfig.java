package cn.joywon.poco.pay.config;

import lombok.extern.slf4j.Slf4j;
import org.springframework.context.annotation.Configuration;

import jakarta.annotation.PostConstruct;
import java.security.Security;

/**
 * SSL/TLS 配置
 * 解决微信支付等第三方接口的 SSL 握手问题
 *
 * @author poco
 * @date 2025-12-28
 */
@Slf4j
@Configuration
public class SslConfig {

    @PostConstruct
    public void init() {
        // 移除对 TLS 相关算法的禁用限制
        String disabledAlgorithms = Security.getProperty("jdk.tls.disabledAlgorithms");
        log.info("原始 jdk.tls.disabledAlgorithms: {}", disabledAlgorithms);
        
        if (disabledAlgorithms != null) {
            // 移除可能影响微信支付的算法限制
            String newDisabledAlgorithms = disabledAlgorithms
                    .replaceAll("TLSv1,?\\s*", "")
                    .replaceAll("TLSv1\\.1,?\\s*", "")
                    .replaceAll("3DES_EDE_CBC,?\\s*", "")
                    .replaceAll(",\\s*,", ",")
                    .replaceAll("^,|,$", "");
            Security.setProperty("jdk.tls.disabledAlgorithms", newDisabledAlgorithms);
            log.info("更新后 jdk.tls.disabledAlgorithms: {}", newDisabledAlgorithms);
        }
        
        // 设置 HTTPS 协议版本
        System.setProperty("https.protocols", "TLSv1.2,TLSv1.3");
        System.setProperty("jdk.tls.client.protocols", "TLSv1.2,TLSv1.3");
        
        log.info("SSL/TLS 协议配置完成");
    }
}
