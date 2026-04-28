package com.cloudflow.auth.domain;

import lombok.Data;
import jakarta.validation.constraints.NotBlank;

@Data
public class LoginBody {
    @NotBlank(message = "Tenant is required")
    private String tenantCode;

    private String username;
    private String password;
    private String captchaToken;
}
