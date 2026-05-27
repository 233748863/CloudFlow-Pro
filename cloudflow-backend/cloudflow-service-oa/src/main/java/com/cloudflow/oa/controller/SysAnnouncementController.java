package com.cloudflow.oa.controller;

import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.log.annotation.SysLog;
import com.cloudflow.oa.config.properties.OaProperties;
import com.cloudflow.oa.domain.SysAnnouncement;
import com.cloudflow.oa.domain.vo.DynamicMapVO;
import com.cloudflow.oa.service.ISysAnnouncementService;
import org.springframework.beans.factory.annotation.Autowired;
import cn.dev33.satoken.annotation.SaCheckPermission;
import cn.dev33.satoken.annotation.SaIgnore;
import org.springframework.web.bind.annotation.*;
import java.util.List;

@RestController
@RequestMapping("/announcement")
public class SysAnnouncementController {

    @Autowired
    private ISysAnnouncementService sysAnnouncementService;

    @Autowired
    private OaProperties oaProperties;

    /**
     * 获取我的公告列表
     */
    @GetMapping("/my-list")
    @SaCheckPermission("oa:announcement:list")
    public R<List<SysAnnouncement>> getMyList() {
        return R.ok(sysAnnouncementService.getMyAnnouncements(UserContext.getUserId()));
    }

    /**
     * 获取匿名公开公告列表
     */
    @GetMapping("/public")
    @SaIgnore
    public R<List<SysAnnouncement>> getPublicList(@RequestParam(defaultValue = "20") Integer limit) {
        if (!Boolean.TRUE.equals(oaProperties.getAnnouncement().getAllowAnonymousRead())) {
            return R.fail("当前租户未开放匿名公告访问");
        }
        return R.ok(sysAnnouncementService.getPublicAnnouncements(limit));
    }

    /**
     * 标记已读
     */
    @PostMapping("/read/{id}")
    @SaCheckPermission("oa:announcement:list")
    public R<Boolean> read(@PathVariable("id") Long id) {
        return R.ok(sysAnnouncementService.readAnnouncement(id, UserContext.getUserId()));
    }

    /**
     * 发布公告 (仅管理员/HR)
     */
    @SysLog("发布公告")
    @PostMapping("/publish")
    @SaCheckPermission("oa:announcement:publish")
    public R<Boolean> publish(@RequestBody SysAnnouncement announcement) {
        announcement.setSenderId(UserContext.getUserId());
        announcement.setCreateBy(String.valueOf(UserContext.getUserId()));
        return R.ok(sysAnnouncementService.publish(announcement));
    }
    
    /**
     * 获取管理列表（分页）- 仅管理员/HR
     */
    @GetMapping("/manage-list")
    @SaCheckPermission("oa:announcement:manage")
    public R<DynamicMapVO> getManageList(
            @RequestParam(required = false) String title,
            @RequestParam(required = false) String type,
            @RequestParam(required = false) String status,
            @RequestParam(defaultValue = "1") Integer page,
            @RequestParam(defaultValue = "10") Integer size) {
        return R.ok(sysAnnouncementService.getManageList(title, type, status, page, size));
    }
    
    /**
     * 编辑公告 - 仅管理员/HR
     */
    @SysLog("编辑公告")
    @PutMapping
    @SaCheckPermission("oa:announcement:edit")
    public R<Boolean> update(@RequestBody SysAnnouncement announcement) {
        return R.ok(sysAnnouncementService.updateAnnouncement(announcement));
    }
    
    /**
     * 删除公告 - 仅管理员
     */
    @SysLog("删除公告")
    @DeleteMapping("/{id}")
    @SaCheckPermission("oa:announcement:remove")
    public R<Boolean> delete(@PathVariable("id") Long id) {
        return R.ok(sysAnnouncementService.removeById(id));
    }
    
    /**
     * 撤销公告 - 仅管理员/HR
     */
    @SysLog("撤销公告")
    @PostMapping("/revoke/{id}")
    @SaCheckPermission("oa:announcement:revoke")
    public R<Boolean> revoke(@PathVariable("id") Long id) {
        return R.ok(sysAnnouncementService.revokeAnnouncement(id));
    }
    
    /**
     * 切换置顶状态 - 仅管理员/HR
     */
    @SysLog("切换公告置顶")
    @PostMapping("/toggle-top/{id}")
    @SaCheckPermission("oa:announcement:edit")
    public R<Boolean> toggleTop(@PathVariable("id") Long id) {
        return R.ok(sysAnnouncementService.toggleTop(id));
    }
    
    /**
     * 获取阅读统计
     */
    @GetMapping("/read-stats/{id}")
    @SaCheckPermission("oa:announcement:manage")
    public R<DynamicMapVO> getReadStats(@PathVariable("id") Long id) {
        return R.ok(sysAnnouncementService.getReadStats(id));
    }
}

