package com.cloudflow.oa.controller;

import com.cloudflow.common.core.domain.R;
import com.cloudflow.oa.domain.dto.SyncDownloadDTO;
import com.cloudflow.oa.domain.dto.SyncResultDTO;
import com.cloudflow.oa.domain.dto.SyncUploadDTO;
import com.cloudflow.oa.service.ISyncService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@Slf4j
@RestController
@RequestMapping("/sync")
public class SyncController {

    @Autowired
    private ISyncService syncService;

    @PostMapping("/upload")
    public R<SyncResultDTO> uploadOfflineData(@RequestBody SyncUploadDTO uploadDTO) {
        log.info("offline sync upload, deviceId={}, actions={}",
                uploadDTO.getDeviceId(),
                uploadDTO.getData() != null ? uploadDTO.getData().size() : 0);

        try {
            SyncResultDTO result = syncService.uploadOfflineData(uploadDTO);
            log.info("offline sync upload completed, synced={}, failed={}, conflicts={}",
                    result.getSynced(), result.getFailed(), result.getConflicts());
            return R.ok(result);
        } catch (Exception e) {
            log.error("offline sync upload failed", e);
            return R.fail("数据上传失败: " + e.getMessage());
        }
    }

    @GetMapping("/download")
    public R<SyncDownloadDTO> downloadIncrementalData(
            @RequestParam("lastSyncTime") String lastSyncTime,
            @RequestParam("deviceId") String deviceId) {
        log.info("offline sync download, deviceId={}, lastSyncTime={}", deviceId, lastSyncTime);

        try {
            SyncDownloadDTO data = syncService.downloadIncrementalData(lastSyncTime, deviceId);
            log.info("offline sync download completed, messages={}, announcements={}",
                    data.getMessages() != null ? data.getMessages().size() : 0,
                    data.getAnnouncements() != null ? data.getAnnouncements().size() : 0);
            return R.ok(data);
        } catch (Exception e) {
            log.error("offline sync download failed", e);
            return R.fail("数据下载失败: " + e.getMessage());
        }
    }

    @PostMapping("/resolve-conflicts")
    public R<Void> resolveConflicts(@RequestBody SyncResultDTO.ConflictDetail[] conflicts) {
        log.info("offline sync resolve conflicts, count={}", conflicts != null ? conflicts.length : 0);

        try {
            syncService.resolveConflicts(conflicts);
            return R.ok();
        } catch (Exception e) {
            log.error("offline sync resolve conflicts failed", e);
            return R.fail("冲突解决失败: " + e.getMessage());
        }
    }
}
