package com.cloudflow.oa.controller;

import cn.dev33.satoken.annotation.SaCheckRole;
import cn.dev33.satoken.annotation.SaMode;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.oa.domain.SysAnnouncement;
import com.cloudflow.oa.service.ISysAnnouncementService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/announcement")
@RequiredArgsConstructor
public class SysAnnouncementController {

    private final ISysAnnouncementService announcementService;

    @GetMapping("/my-list")
    public R<List<SysAnnouncement>> getMyList() {
        return R.ok(announcementService.getMyAnnouncements(UserContext.getUserId()));
    }

    @PostMapping("/read/{id}")
    public R<Boolean> read(@PathVariable("id") Long id) {
        return R.ok(announcementService.readAnnouncement(id, UserContext.getUserId()));
    }

    @PostMapping("/publish")
    @SaCheckRole(value = {"admin", "hr"}, mode = SaMode.OR)
    public R<Boolean> publish(@RequestBody SysAnnouncement announcement) {
        announcement.setSenderId(UserContext.getUserId());
        announcement.setCreateBy(String.valueOf(UserContext.getUserId()));
        return R.ok(announcementService.publish(announcement));
    }

    @GetMapping("/manage-list")
    @SaCheckRole(value = {"admin", "hr"}, mode = SaMode.OR)
    public R<Map<String, Object>> getManageList(
            @RequestParam(required = false) String title,
            @RequestParam(required = false) String type,
            @RequestParam(required = false) String status,
            @RequestParam(defaultValue = "1") Integer page,
            @RequestParam(defaultValue = "10") Integer size) {
        return R.ok(announcementService.getManageList(title, type, status, page, size));
    }

    @PutMapping
    @SaCheckRole(value = {"admin", "hr"}, mode = SaMode.OR)
    public R<Boolean> update(@RequestBody SysAnnouncement announcement) {
        return R.ok(announcementService.updateAnnouncement(announcement));
    }

    @DeleteMapping("/{id}")
    @SaCheckRole("admin")
    public R<Boolean> delete(@PathVariable("id") Long id) {
        return R.ok(announcementService.removeById(id));
    }

    @PostMapping("/revoke/{id}")
    @SaCheckRole(value = {"admin", "hr"}, mode = SaMode.OR)
    public R<Boolean> revoke(@PathVariable("id") Long id) {
        return R.ok(announcementService.revokeAnnouncement(id));
    }

    @PostMapping("/toggle-top/{id}")
    @SaCheckRole(value = {"admin", "hr"}, mode = SaMode.OR)
    public R<Boolean> toggleTop(@PathVariable("id") Long id) {
        return R.ok(announcementService.toggleTop(id));
    }

    @GetMapping("/read-stats/{id}")
    public R<Map<String, Object>> getReadStats(@PathVariable("id") Long id) {
        return R.ok(announcementService.getReadStats(id));
    }
}
