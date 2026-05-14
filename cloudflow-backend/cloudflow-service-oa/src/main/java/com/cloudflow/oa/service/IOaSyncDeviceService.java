package com.cloudflow.oa.service;

import com.baomidou.mybatisplus.extension.service.IService;
import com.cloudflow.oa.domain.OaSyncDevice;

/**
 * 同步设备服务。
 */
public interface IOaSyncDeviceService extends IService<OaSyncDevice> {

    void registerDevice(String deviceId, String deviceName, Long userId, Long tenantId);

    OaSyncDevice validateDevice(String deviceId, Long userId, Long tenantId);

    void updateLastSyncTime(String deviceId, Long userId, Long tenantId, Long syncTimeMillis);
}
