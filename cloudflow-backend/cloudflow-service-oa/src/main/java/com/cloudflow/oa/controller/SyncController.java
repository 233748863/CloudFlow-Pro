package com.cloudflow.oa.controller;

import cn.dev33.satoken.annotation.SaCheckLogin;
import cn.dev33.satoken.annotation.SaCheckPermission;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.oa.domain.dto.SyncDeviceRegisterDTO;
import com.cloudflow.oa.domain.dto.SyncDownloadDTO;
import com.cloudflow.oa.domain.dto.SyncResultDTO;
import com.cloudflow.oa.domain.dto.SyncUploadDTO;
import com.cloudflow.oa.service.ISyncService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

/**
 * 离线同步控制器
 */
@Slf4j
@RestController
@RequestMapping("/sync")
@SaCheckLogin
public class SyncController {

    @Autowired
    private ISyncService syncService;

    /**
     * 注册同步设备
     *
     * @param registerDTO 注册信息
     * @return 处理结果
     */
    @PostMapping("/register-device")
    @SaCheckPermission("workspace:dashboard")
    public R<Void> registerDevice(@RequestBody SyncDeviceRegisterDTO registerDTO) {
        try {
            syncService.registerDevice(registerDTO);
            return R.ok();
        } catch (Exception e) {
            log.error("同步设备注册失败", e);
            return R.fail("设备注册失败: " + e.getMessage());
        }
    }

    /**
     * 上传离线数据
     *
     * @param uploadDTO 上传数据
     * @return 同步结果
     */
    @PostMapping("/upload")
    @SaCheckPermission("workspace:dashboard")
    public R<SyncResultDTO> uploadOfflineData(@RequestBody SyncUploadDTO uploadDTO) {
        log.info("接收离线数据上传请求，设备ID: {}, 操作数量: {}",
                uploadDTO == null ? null : uploadDTO.getDeviceId(),
                uploadDTO == null || uploadDTO.getData() == null ? 0 : uploadDTO.getData().size());

        try {
            SyncResultDTO result = syncService.uploadOfflineData(uploadDTO);
            log.info("离线数据上传完成，成功: {}, 失败: {}, 冲突: {}",
                    result.getSynced(), result.getFailed(), result.getConflicts());
            return R.ok(result);
        } catch (Exception e) {
            log.error("离线数据上传失败", e);
            return R.fail("数据上传失败: " + e.getMessage());
        }
    }

    /**
     * 下载增量数据
     *
     * @param lastSyncTime 上次同步时间戳（毫秒）
     * @param deviceId 设备ID
     * @return 增量数据
     */
    @GetMapping("/download")
    @SaCheckPermission("workspace:dashboard")
    public R<SyncDownloadDTO> downloadIncrementalData(
            @RequestParam("lastSyncTime") Long lastSyncTime,
            @RequestParam("deviceId") String deviceId) {
        log.info("接收增量数据下载请求，设备ID: {}, 上次同步时间: {}", deviceId, lastSyncTime);

        try {
            SyncDownloadDTO data = syncService.downloadIncrementalData(lastSyncTime, deviceId);
            log.info("增量数据下载完成，任务: {}, 消息: {}, 公告: {}",
                    data.getTasks() != null ? data.getTasks().size() : 0,
                    data.getMessages() != null ? data.getMessages().size() : 0,
                    data.getAnnouncements() != null ? data.getAnnouncements().size() : 0);
            return R.ok(data);
        } catch (Exception e) {
            log.error("增量数据下载失败", e);
            return R.fail("数据下载失败: " + e.getMessage());
        }
    }

    /**
     * 解决冲突
     *
     * @param conflicts 冲突列表
     * @return 处理结果
     */
    @PostMapping("/resolve-conflicts")
    @SaCheckPermission("workspace:dashboard")
    public R<Void> resolveConflicts(@RequestBody SyncResultDTO.ConflictDetail[] conflicts) {
        log.info("接收冲突解决请求，冲突数量: {}", conflicts != null ? conflicts.length : 0);

        try {
            syncService.resolveConflicts(conflicts);
            log.info("冲突解决完成");
            return R.ok();
        } catch (Exception e) {
            log.error("冲突解决失败", e);
            return R.fail("冲突解决失败: " + e.getMessage());
        }
    }
}
