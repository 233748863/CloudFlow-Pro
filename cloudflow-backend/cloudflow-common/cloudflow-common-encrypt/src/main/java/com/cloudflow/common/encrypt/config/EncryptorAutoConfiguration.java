package com.cloudflow.common.encrypt.config;

import com.cloudflow.common.encrypt.interceptor.MybatisDecryptInterceptor;
import com.cloudflow.common.encrypt.interceptor.MybatisEncryptInterceptor;
import com.cloudflow.common.encrypt.properties.EncryptorProperties;
import org.springframework.beans.factory.InitializingBean;
import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;

/**
 * 加密模块自动配置
 * <p>
 * 通过 cloudflow.encrypt.enabled=true 显式启用。
 *
 * @author CloudFlow
 */
@AutoConfiguration
@EnableConfigurationProperties(EncryptorProperties.class)
@ConditionalOnProperty(prefix = "cloudflow.encrypt", name = "enabled", havingValue = "true")
public class EncryptorAutoConfiguration {

    @Bean
    public InitializingBean encryptorPropertiesValidator(EncryptorProperties properties) {
        return () -> properties.validate();
    }

    @Bean
    public MybatisEncryptInterceptor mybatisEncryptInterceptor(EncryptorProperties properties) {
        return new MybatisEncryptInterceptor(properties);
    }

    @Bean
    public MybatisDecryptInterceptor mybatisDecryptInterceptor(EncryptorProperties properties) {
        return new MybatisDecryptInterceptor(properties);
    }
}
