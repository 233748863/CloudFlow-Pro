package com.cloudflow.oa.controller;

import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.log.annotation.SysLog;
import com.cloudflow.oa.domain.SysAnnouncement;
import com.cloudflow.oa.domain.vo.DynamicMapVO;
import com.cloudflow.oa.service.ISysAnnouncementService;
import org.springframework.beans.factory.annotation.Autowired;
import cn.dev33.satoken.annotation.SaCheckLogin;
import cn.dev33.satoken.annotation.SaCheckPermission;
import cn.dev33.satoken.annotation.SaCheckRole;
import cn.dev33.satoken.annotation.SaMode;
import org.springframework.web.bind.annotation.*;
import java.util.List;

@RestController
@RequestMapping("/announcement")
@SaCheckLogin
public class SysAnnouncementController {

    @Autowired
    private ISysAnnouncementService announcementService;

    /**
     * 获取我的公告列表
     */
    @GetMapping("/my-list")
    @SaCheckPermission("office:announcement")
    public R<List<SysAnnouncement>> getMyList() {
        return R.ok(announcementService.getMyAnnouncements(UserContext.getUserId()));
    }

    /**
     * 标记已读
     */
    @PostMapping("/read/{id}")
    @SaCheckPermission("office:announcement")
    public R<Boolean> read(@PathVariable("id") Long id) {
        return R.ok(announcementService.readAnnouncement(id, UserContext.getUserId()));
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
        return R.ok(announcementService.publish(announcement));
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
        return R.ok(DynamicMapVO.from(announcementService.getManageList(title, type, status, page, size)));
    }
    
    /**
     * 编辑公告 - 仅管理员/HR
     */
    @SysLog("编辑公告")
    @PutMapping
    @SaCheckPermission("oa:announcement:edit")
    public R<Boolean> update(@RequestBody SysAnnouncement announcement) {
        return R.ok(announcementService.updateAnnouncement(announcement));
    }
    
    /**
     * 删除公告 - 仅管理员
     */
    @SysLog("删除公告")
    @DeleteMapping("/{id}")
    @SaCheckPermission("oa:announcement:remove")
    public R<Boolean> delete(@PathVariable("id") Long id) {
        return R.ok(announcementService.removeById(id));
    }
    
    /**
     * 撤销公告 - 仅管理员/HR
     */
    @SysLog("撤销公告")
    @PostMapping("/revoke/{id}")
    @SaCheckPermission("oa:announcement:revoke")
    public R<Boolean> revoke(@PathVariable("id") Long id) {
        return R.ok(announcementService.revokeAnnouncement(id));
    }
    
    /**
     * 切换置顶状态 - 仅管理员/HR
     */
    @SysLog("切换公告置顶")
    @PostMapping("/toggle-top/{id}")
    @SaCheckPermission("oa:announcement:edit")
    public R<Boolean> toggleTop(@PathVariable("id") Long id) {
        return R.ok(announcementService.toggleTop(id));
    }
    
    /**
     * 获取阅读统计
     */
    @GetMapping("/read-stats/{id}")
    @SaCheckPermission("oa:announcement:manage")
    public R<DynamicMapVO> getReadStats(@PathVariable("id") Long id) {
        return R.ok(DynamicMapVO.from(announcementService.getReadStats(id)));
    }
}
