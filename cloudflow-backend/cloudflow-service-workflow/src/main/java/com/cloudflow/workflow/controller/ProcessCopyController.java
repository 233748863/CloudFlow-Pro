package com.cloudflow.workflow.controller;

import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.workflow.domain.WfProcessCopy;
import com.cloudflow.workflow.service.IProcessCopyService;
import lombok.RequiredArgsConstructor;
import cn.dev33.satoken.annotation.SaCheckLogin;
import cn.dev33.satoken.annotation.SaCheckPermission;
import cn.dev33.satoken.annotation.SaCheckRole;
import cn.dev33.satoken.annotation.SaMode;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * 流程抄送控制器
 * 提供"抄送我的"列表查询、已读标记、未读数量等接口
 */
@RestController
@RequestMapping("/copy")
@RequiredArgsConstructor
@SaCheckLogin
public class ProcessCopyController {

    private final IProcessCopyService processCopyService;

    /**
     * 查询"抄送我的"列表（分页）
     * 支持筛选参数：keyword（标题搜索）、isRead（0-未读/1-已读）、processDefKey（流程类型）
     */
    @GetMapping("/list")
    public R<PageResult<WfProcessCopy>> getMyCopyList(@ModelAttribute PageQuery pageQuery) {
        Long userId = UserContext.getUserId();
        return R.ok(processCopyService.getMyCopyList(userId, pageQuery));
    }

    /**
     * 获取未读抄送数量
     */
    @GetMapping("/unread-count")
    public R<Integer> getUnreadCount() {
        Long userId = UserContext.getUserId();
        return R.ok(processCopyService.getUnreadCount(userId));
    }

    /**
     * 标记单条抄送记录为已读
     */
    @PostMapping("/read/{copyId}")
    public R<?> markAsRead(@PathVariable("copyId") Long copyId) {
        Long userId = UserContext.getUserId();
        processCopyService.markAsRead(copyId, userId);
        return R.ok();
    }

    /**
     * 批量标记为已读
     */
    @PostMapping("/batch-read")
    public R<?> batchMarkAsRead(@RequestBody Map<String, List<Long>> body) {
        Long userId = UserContext.getUserId();
        List<Long> copyIds = body.get("copyIds");
        processCopyService.batchMarkAsRead(copyIds, userId);
        return R.ok();
    }
}
