package com.cloudflow.workflow.controller;

import cn.dev33.satoken.annotation.SaCheckPermission;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.workflow.callback.CallbackDlqReplayer;
import com.cloudflow.workflow.domain.WfCallbackDeadLetter;
import com.cloudflow.workflow.mapper.WfCallbackDeadLetterMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import com.cloudflow.common.idempotent.annotation.RepeatSubmit;

@RestController
@RequestMapping("/wf/callback/dlq")
@RequiredArgsConstructor
@SaCheckPermission("workflow:callback:admin")
public class CallbackDlqAdminController {

    private final WfCallbackDeadLetterMapper deadLetterMapper;
    private final CallbackDlqReplayer dlqReplayer;

    @GetMapping("/list")
    public R<Page<WfCallbackDeadLetter>> list(
            @RequestParam(defaultValue = "1") long current,
            @RequestParam(defaultValue = "20") long size,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) Long tenantId) {
        LambdaQueryWrapper<WfCallbackDeadLetter> q = new LambdaQueryWrapper<>();
        if (status != null && !status.isBlank()) {
            q.eq(WfCallbackDeadLetter::getStatus, status);
        }
        if (tenantId != null) {
            q.eq(WfCallbackDeadLetter::getTenantId, tenantId);
        }
        q.orderByDesc(WfCallbackDeadLetter::getId);
        Page<WfCallbackDeadLetter> result = deadLetterMapper.selectPage(new Page<>(current, size), q);
        result.getRecords().stream().filter(entry -> com.cloudflow.workflow.service.WorkflowTriggerService.BUSINESS_TYPE.equals(entry.getBusinessType()))
                .forEach(entry -> entry.setPayloadJson("{\"request_cipher\":\"****\"}"));
        return R.ok(result);
    }

    @RepeatSubmit
    @PostMapping("/{id}/replay")
    @com.cloudflow.common.log.annotation.SysLog("重放工作流死信")
    public R<Void> replay(@PathVariable Long id) {
        WfCallbackDeadLetter dlq = deadLetterMapper.selectById(id);
        if (dlq == null) {
            return R.fail("死信记录不存在");
        }
        dlqReplayer.replay(dlq);
        return R.ok();
    }

    @RepeatSubmit
    @PostMapping("/{id}/ignore")
    @com.cloudflow.common.log.annotation.SysLog("忽略工作流死信")
    public R<Void> ignore(@PathVariable Long id) {
        WfCallbackDeadLetter dlq = deadLetterMapper.selectById(id);
        if (dlq == null) {
            return R.fail("死信记录不存在");
        }
        dlq.setStatus("IGNORED");
        dlq.setUpdateTime(LocalDateTime.now());
        deadLetterMapper.updateById(dlq);
        return R.ok();
    }
}
