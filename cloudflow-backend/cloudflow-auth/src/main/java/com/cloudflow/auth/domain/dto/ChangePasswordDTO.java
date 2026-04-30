package com.cloudflow.auth.domain.dto;

import lombok.Data;

/**
 * 修改当前用户密码入参。
 */
@Data
public class ChangePasswordDTO {

    private String oldPassword;

    private String newPassword;
}
