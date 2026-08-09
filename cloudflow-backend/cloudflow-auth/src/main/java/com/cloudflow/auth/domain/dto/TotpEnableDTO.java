package com.cloudflow.auth.domain.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import lombok.Data;

@Data
public class TotpEnableDTO {

    @NotBlank(message = "当前密码不能为空")
    private String password;

    @NotBlank(message = "验证码不能为空")
    @Pattern(regexp = "\\d{6}", message = "请输入6位验证码")
    private String code;
}
