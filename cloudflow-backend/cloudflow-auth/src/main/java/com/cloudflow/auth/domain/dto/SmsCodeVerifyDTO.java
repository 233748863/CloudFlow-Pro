package com.cloudflow.auth.domain.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

/**
 * 短信验证码校验请求。
 */
@Data
public class SmsCodeVerifyDTO {
    @NotBlank(message = "手机号不能为空")
    private String phone;
    @NotBlank(message = "业务场景不能为空")
    private String bizScene;
    @NotBlank(message = "验证码不能为空")
    private String code;
}
