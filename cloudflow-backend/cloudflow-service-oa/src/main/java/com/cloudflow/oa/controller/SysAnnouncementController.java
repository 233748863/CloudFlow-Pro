package com.cloudflow.oa.controller;

import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.oa.domain.SysAnnouncement;
import com.cloudflow.oa.service.ISysAnnouncementService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;
import java.util.List;

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
     * 获取管理列表 (简化版，复用 my-list 或者直接查全表)
     * 实际生产中应有单独的 manage-list 接口
     */
    @GetMapping("/list")
    public R<List<SysAnnouncement>> list() {
        // 简单返回所有，实际应分页
        return R.ok(announcementService.list());
    }
}
