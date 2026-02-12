package com.cloudflow.common.config;

import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Contact;
import io.swagger.v3.oas.models.info.Info;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class SwaggerConfig {

    @Bean
    public OpenAPI customOpenAPI() {
        return new OpenAPI()
                .info(new Info()
                        .title("CloudFlow Pro API")
                        .version("1.0.0")
                        .description("CloudFlow Pro 微服务接口文档")
                        .contact(new Contact()
                                .name("CloudFlow Team")
                                .url("https://github.com/cloudflow")
                                .email("support@cloudflow.com")));
    }
}
