package com.cloudflow.auth.domain.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

@Data
public class TotpSetupDTO {

    @NotBlank(message = "当前密码不能为空")
    private String password;
}
