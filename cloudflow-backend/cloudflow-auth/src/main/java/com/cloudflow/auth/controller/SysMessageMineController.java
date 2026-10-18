package com.cloudflow.auth.controller;

import cn.dev33.satoken.annotation.SaCheckPermission;
import com.cloudflow.auth.domain.dto.MarkReadDTO;
import com.cloudflow.auth.domain.vo.MyMessageVO;
import com.cloudflow.auth.service.MessageRecordService;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.log.annotation.SysLog;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * 当前用户消息接口。
 */
@RestController
@RequestMapping("/system/message/mine")
@RequiredArgsConstructor
public class SysMessageMineController {
    private final MessageRecordService service;

    @GetMapping
    @SaCheckPermission("system:message:mine:list")
    public R<PageResult<MyMessageVO>> myMessages(@RequestParam(required = false) String category,
                                                 @RequestParam(required = false) Integer readFlag,
                                                 @RequestParam(required = false) String beginTime,
                                                 @RequestParam(required = false) String endTime,
                                                 @RequestParam(defaultValue = "1") Integer pageNum,
                                                 @RequestParam(defaultValue = "10") Integer pageSize) {
        return R.ok(service.mine(category, readFlag, beginTime, endTime, pageNum, pageSize));
    }

    @GetMapping("/unread-count")
    @SaCheckPermission("system:message:mine:list")
    public R<Map<String, Long>> unreadCount() {
        return R.ok(service.unreadCount());
    }

    @SysLog("标记消息已读")
    @PutMapping("/read")
    @SaCheckPermission("system:message:mine:read")
    public R<Void> markRead(@RequestBody MarkReadDTO dto) {
        service.markRead(dto);
        return R.ok();
    }

    @GetMapping("/{recordId}")
    @SaCheckPermission("system:message:mine:list")
    public R<MyMessageVO> detail(@PathVariable Long recordId) {
        return R.ok(service.detailMine(recordId));
    }
}
