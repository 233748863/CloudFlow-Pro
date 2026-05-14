package com.cloudflow.oa.domain.dto;

import lombok.Data;

import java.io.Serializable;

/**
 * 同步设备注册 DTO。
 */
@Data
public class SyncDeviceRegisterDTO implements Serializable {
    private static final long serialVersionUID = 1L;

    private String deviceId;

    private String deviceName;
}
