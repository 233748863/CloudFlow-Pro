package com.cloudflow.auth.domain.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import lombok.Data;

/**
 * 短信验证码发送请求。
 */
@Data
public class SmsCodeSendDTO {
    @NotBlank(message = "手机号不能为空")
    @Pattern(regexp = "^1[3-9]\\d{9}$", message = "手机号格式不正确")
    private String phone;
    @NotBlank(message = "业务场景不能为空")
    private String bizScene;
    private String captchaToken;
}
