package com.cloudflow.auth.domain;

import lombok.Data;

@Data
public class LoginBody {
    private String tenantCode;
    private String username;
    private String password;
    private String captchaToken;
}
