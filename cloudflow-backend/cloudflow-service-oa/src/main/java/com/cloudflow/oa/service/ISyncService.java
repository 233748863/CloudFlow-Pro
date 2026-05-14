package com.cloudflow.oa.service;

import com.cloudflow.oa.domain.dto.SyncDeviceRegisterDTO;
import com.cloudflow.oa.domain.dto.SyncDownloadDTO;
import com.cloudflow.oa.domain.dto.SyncResultDTO;
import com.cloudflow.oa.domain.dto.SyncUploadDTO;

/**
 * 离线同步服务接口
 */
public interface ISyncService {

    /**
     * 注册同步设备
     *
     * @param registerDTO 注册信息
     */
    void registerDevice(SyncDeviceRegisterDTO registerDTO);

    /**
     * 上传离线数据
     *
     * @param uploadDTO 上传数据
     * @return 同步结果
     */
    SyncResultDTO uploadOfflineData(SyncUploadDTO uploadDTO);

    /**
     * 下载增量数据
     *
     * @param lastSyncTime 上次同步时间戳（毫秒）
     * @param deviceId 设备ID
     * @return 增量数据
     */
    SyncDownloadDTO downloadIncrementalData(Long lastSyncTime, String deviceId);

    /**
     * 解决冲突
     *
     * @param conflicts 冲突列表
     */
    void resolveConflicts(SyncResultDTO.ConflictDetail[] conflicts);
}
