package com.cloudflow.auth.domain.dto;

import lombok.Data;

/**
 * 管理员重置用户密码入参。
 */
@Data
public class ResetPasswordDTO {

    private String password;
}
