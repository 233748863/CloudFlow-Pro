package com.cloudflow.auth.domain.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import lombok.Data;

@Data
public class TotpLoginDTO {

    @NotBlank(message = "登录验证凭证不能为空")
    private String tempToken;

    @NotBlank(message = "验证码不能为空")
    @Pattern(regexp = "\\d{6}", message = "请输入6位验证码")
    private String code;
}
