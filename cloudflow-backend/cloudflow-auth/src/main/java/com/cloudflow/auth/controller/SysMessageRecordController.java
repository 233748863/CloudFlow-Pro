package com.cloudflow.auth.controller;

import cn.dev33.satoken.annotation.SaCheckPermission;
import com.cloudflow.auth.domain.dto.MessageRecordQuery;
import com.cloudflow.auth.domain.dto.ResendResultVO;
import com.cloudflow.auth.domain.vo.MessageStatisticsVO;
import com.cloudflow.auth.domain.vo.SysMessageRecordVO;
import com.cloudflow.auth.service.MessageRecordService;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.idempotent.annotation.RepeatSubmit;
import com.cloudflow.common.log.annotation.SysLog;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * 消息发送记录管理。
 */
@RestController
@RequestMapping("/system/message/record")
@RequiredArgsConstructor
public class SysMessageRecordController {
    private final MessageRecordService service;

    @GetMapping("/list")
    @SaCheckPermission("system:message:record:list")
    public R<PageResult<SysMessageRecordVO>> list(MessageRecordQuery query,
                                                @RequestParam(defaultValue = "1") Integer pageNum,
                                                @RequestParam(defaultValue = "10") Integer pageSize) {
        return R.ok(service.list(query, pageNum, pageSize));
    }

    @SysLog("重发消息")
    @RepeatSubmit
    @PostMapping("/{recordIds}/resend")
    @SaCheckPermission("system:message:record:resend")
    public R<ResendResultVO> resend(@PathVariable List<Long> recordIds) {
        return R.ok(service.resend(recordIds));
    }

    @GetMapping("/statistics")
    @SaCheckPermission("system:message:record:list")
    public R<MessageStatisticsVO> statistics(@RequestParam(required = false) String beginTime,
                                             @RequestParam(required = false) String endTime) {
        return R.ok(service.statistics(beginTime, endTime));
    }
}
