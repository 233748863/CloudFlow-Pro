package com.cloudflow.common.sensitive.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.module.SimpleModule;
import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.boot.autoconfigure.condition.ConditionalOnClass;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.boot.autoconfigure.jackson.Jackson2ObjectMapperBuilderCustomizer;
import org.springframework.context.annotation.Bean;

/**
 * 敏感字段自动脱敏配置。
 */
@AutoConfiguration
@ConditionalOnClass({ObjectMapper.class, Jackson2ObjectMapperBuilderCustomizer.class})
public class SensitiveAutoConfiguration {

    @Bean
    @ConditionalOnMissingBean(name = "cloudFlowSensitiveJacksonCustomizer")
    public Jackson2ObjectMapperBuilderCustomizer cloudFlowSensitiveJacksonCustomizer() {
        return builder -> {
            SimpleModule module = new SimpleModule("cloudflow-sensitive-module");
            module.setSerializerModifier(new SensitiveBeanSerializerModifier());
            builder.modulesToInstall(modules -> modules.add(module));
        };
    }
}
