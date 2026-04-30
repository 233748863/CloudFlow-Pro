package com.cloudflow.auth.domain.dto;

import lombok.Data;

/**
 * 滑块验证码校验入参。
 */
@Data
public class CaptchaCheckDTO {

    private String uuid;

    private Integer x;
}
