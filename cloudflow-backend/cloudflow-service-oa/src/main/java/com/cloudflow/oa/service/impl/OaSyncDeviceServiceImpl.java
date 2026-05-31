package com.cloudflow.oa.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.cloudflow.common.core.exception.ServiceException;
import com.cloudflow.oa.domain.OaSyncDevice;
import com.cloudflow.oa.mapper.OaSyncDeviceMapper;
import com.cloudflow.oa.service.IOaSyncDeviceService;
import com.cloudflow.common.audit.annotation.Audit;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;

/**
 * 同步设备服务实现。
 */
@Service
public class OaSyncDeviceServiceImpl extends ServiceImpl<OaSyncDeviceMapper, OaSyncDevice> implements IOaSyncDeviceService {

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void registerDevice(String deviceId, String deviceName, Long userId, Long tenantId) {
        if (!StringUtils.hasText(deviceId)) {
            throw new ServiceException("设备ID不能为空");
        }
        if (userId == null || tenantId == null) {
            throw new ServiceException("当前用户上下文缺失");
        }

        String normalizedDeviceId = deviceId.trim();
        String normalizedDeviceName = StringUtils.hasText(deviceName) ? deviceName.trim() : normalizedDeviceId;
        LambdaQueryWrapper<OaSyncDevice> wrapper = new LambdaQueryWrapper<OaSyncDevice>()
                .eq(OaSyncDevice::getDeviceId, normalizedDeviceId)
                .eq(OaSyncDevice::getUserId, userId)
                .eq(OaSyncDevice::getTenantId, tenantId);
        OaSyncDevice existing = getOne(wrapper, false);
        if (existing != null) {
            if (!normalizedDeviceName.equals(existing.getDeviceName())) {
                existing.setDeviceName(normalizedDeviceName);
                updateById(existing);
            }
            return;
        }

        OaSyncDevice device = new OaSyncDevice();
        device.setDeviceId(normalizedDeviceId);
        device.setDeviceName(normalizedDeviceName);
        device.setUserId(userId);
        device.setTenantId(tenantId);
        save(device);
    }

    @Override
    public OaSyncDevice validateDevice(String deviceId, Long userId, Long tenantId) {
        if (!StringUtils.hasText(deviceId)) {
            throw new ServiceException("设备ID不能为空");
        }
        if (userId == null || tenantId == null) {
            throw new ServiceException("当前用户上下文缺失");
        }

        OaSyncDevice device = getOne(new LambdaQueryWrapper<OaSyncDevice>()
                .eq(OaSyncDevice::getDeviceId, deviceId.trim())
                .eq(OaSyncDevice::getUserId, userId)
                .eq(OaSyncDevice::getTenantId, tenantId), false);
        if (device == null) {
            throw new ServiceException("设备未注册，请先完成设备注册");
        }
        return device;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    @Audit(name = "更新同步时间")
    public void updateLastSyncTime(String deviceId, Long userId, Long tenantId, Long syncTimeMillis) {
        OaSyncDevice device = validateDevice(deviceId, userId, tenantId);
        if (syncTimeMillis == null || syncTimeMillis <= 0) {
            device.setLastSyncTime(LocalDateTime.now());
        } else {
            device.setLastSyncTime(LocalDateTime.ofInstant(Instant.ofEpochMilli(syncTimeMillis), ZoneId.systemDefault()));
        }
        updateById(device);
    }
}
