package com.cloudflow.oa.controller;

import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.oa.domain.SysAnnouncement;
import com.cloudflow.oa.service.ISysAnnouncementService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/announcement")
public class SysAnnouncementController {

    @Autowired
    private ISysAnnouncementService announcementService;

    /**
     * 获取我的公告列表
     */
    @GetMapping("/my-list")
    public R<List<SysAnnouncement>> getMyList() {
        return R.ok(announcementService.getMyAnnouncements(UserContext.getUserId()));
    }

    /**
     * 标记已读
     */
    @PostMapping("/read/{id}")
    public R<Boolean> read(@PathVariable("id") Long id) {
        return R.ok(announcementService.readAnnouncement(id, UserContext.getUserId()));
    }

    /**
     * 发布公告 (仅管理员)
     */
    @PostMapping("/publish")
    public R<Boolean> publish(@RequestBody SysAnnouncement announcement) {
        announcement.setSenderId(UserContext.getUserId());
        announcement.setCreateBy(String.valueOf(UserContext.getUserId()));
        return R.ok(announcementService.publish(announcement));
    }
    
    /**
     * 获取管理列表（分页）
     */
    @GetMapping("/manage-list")
    public R<Map<String, Object>> getManageList(
            @RequestParam(required = false) String title,
            @RequestParam(required = false) String type,
            @RequestParam(required = false) String status,
            @RequestParam(defaultValue = "1") Integer page,
            @RequestParam(defaultValue = "10") Integer size) {
        return R.ok(announcementService.getManageList(title, type, status, page, size));
    }
    
    /**
     * 编辑公告
     */
    @PutMapping
    public R<Boolean> update(@RequestBody SysAnnouncement announcement) {
        return R.ok(announcementService.updateAnnouncement(announcement));
    }
    
    /**
     * 删除公告
     */
    @DeleteMapping("/{id}")
    public R<Boolean> delete(@PathVariable("id") Long id) {
        return R.ok(announcementService.removeById(id));
    }
    
    /**
     * 撤销公告
     */
    @PostMapping("/revoke/{id}")
    public R<Boolean> revoke(@PathVariable("id") Long id) {
        return R.ok(announcementService.revokeAnnouncement(id));
    }
    
    /**
     * 切换置顶状态
     */
    @PostMapping("/toggle-top/{id}")
    public R<Boolean> toggleTop(@PathVariable("id") Long id) {
        return R.ok(announcementService.toggleTop(id));
    }
    
    /**
     * 获取阅读统计
     */
    @GetMapping("/read-stats/{id}")
    public R<Map<String, Object>> getReadStats(@PathVariable("id") Long id) {
        return R.ok(announcementService.getReadStats(id));
    }
}
