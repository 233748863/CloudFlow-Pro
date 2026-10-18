package com.cloudflow.hr.config;

import com.fasterxml.jackson.databind.module.SimpleModule;
import com.fasterxml.jackson.databind.ser.std.ToStringSerializer;
import java.math.BigDecimal;
import java.util.List;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.converter.HttpMessageConverter;
import org.springframework.http.converter.json.MappingJackson2HttpMessageConverter;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/** Preserve decimal values in browser transport without changing internal snapshots or digests. */
@Configuration
public class HrMoneyHttpConfig implements WebMvcConfigurer {
    @Override
    public void extendMessageConverters(List<HttpMessageConverter<?>> converters) {
        SimpleModule decimals = new SimpleModule("hr-http-decimal-text");
        decimals.addSerializer(BigDecimal.class, ToStringSerializer.instance);
        for (HttpMessageConverter<?> converter : converters) {
            if (converter instanceof MappingJackson2HttpMessageConverter json) {
                json.setObjectMapper(json.getObjectMapper().copy().registerModule(decimals));
            }
        }
    }
}
