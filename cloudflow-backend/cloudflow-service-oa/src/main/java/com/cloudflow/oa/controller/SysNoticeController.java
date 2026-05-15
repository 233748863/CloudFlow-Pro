package com.cloudflow.oa.controller;

import cn.dev33.satoken.annotation.SaCheckPermission;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.oa.domain.SysNotice;
import com.cloudflow.oa.service.ISysNoticeService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/notice")
public class SysNoticeController {

    @Autowired
    private ISysNoticeService noticeService;

    @GetMapping("/list")
    @SaCheckPermission("oa:notice:list")
    public R<PageResult<SysNotice>> list(PageQuery pageQuery) {
        return R.ok(noticeService.getMyNotices(UserContext.getUserId(), pageQuery));
    }

    @PostMapping("/read/{noticeId}")
    @SaCheckPermission("oa:notice:read")
    public R<?> read(@PathVariable("noticeId") Long noticeId) {
        noticeService.readNotice(noticeId);
        return R.ok();
    }

    @GetMapping("/unread-count")
    @SaCheckPermission("oa:notice:list")
    public R<Long> getUnreadCount() {
        return R.ok(noticeService.getUnreadCount(UserContext.getUserId()));
    }

    /**
     * 获取消息详情
     */
    @GetMapping("/{noticeId}")
    @SaCheckPermission("oa:notice:read")
    public R<SysNotice> getNoticeDetail(@PathVariable("noticeId") Long noticeId) {
        return R.ok(noticeService.getNoticeById(noticeId));
    }

    /**
     * 删除消息
     */
    @DeleteMapping("/{noticeId}")
    @SaCheckPermission("oa:notice:remove")
    public R<?> deleteNotice(@PathVariable("noticeId") Long noticeId) {
        noticeService.deleteNotice(noticeId);
        return R.ok();
    }
}

