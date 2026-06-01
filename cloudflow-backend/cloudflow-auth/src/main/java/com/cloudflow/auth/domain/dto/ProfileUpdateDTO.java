package com.cloudflow.auth.domain.dto;

import lombok.Data;

/**
 * 当前用户资料更新入参。
 */
@Data
public class ProfileUpdateDTO {

    private String nickName;

    private String email;

    private String phonenumber;

    private String phone;

}
