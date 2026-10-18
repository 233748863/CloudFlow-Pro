package com.cloudflow.common.tenant.session;

import com.cloudflow.common.core.permission.LoginSessionPolicy;
import com.cloudflow.common.tenant.session.mapper.LoginSessionMapper;
import org.mybatis.spring.annotation.MapperScan;
import org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.transaction.PlatformTransactionManager;

@Configuration
@ConditionalOnWebApplication(type = ConditionalOnWebApplication.Type.SERVLET)
@MapperScan("com.cloudflow.common.tenant.session.mapper")
public class LoginSessionConfiguration {
    @Bean
    public LoginSessionPolicy loginSessionPolicy(LoginSessionMapper mapper, PlatformTransactionManager transactions) {
        return new LoginSessionPolicyService(mapper, transactions);
    }
}
