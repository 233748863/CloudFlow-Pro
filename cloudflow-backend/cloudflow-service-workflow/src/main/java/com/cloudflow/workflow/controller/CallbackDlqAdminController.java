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
            @RequestParam(required = false) String status) {
        LambdaQueryWrapper<WfCallbackDeadLetter> q = new LambdaQueryWrapper<>();
        if (status != null && !status.isBlank()) {
            q.eq(WfCallbackDeadLetter::getStatus, status);
        }
        q.orderByDesc(WfCallbackDeadLetter::getId);
        return R.ok(deadLetterMapper.selectPage(new Page<>(current, size), q));
    }

    @PostMapping("/{id}/replay")
    public R<Void> replay(@PathVariable Long id) {
        WfCallbackDeadLetter dlq = deadLetterMapper.selectById(id);
        if (dlq == null) {
            return R.fail("死信记录不存在");
        }
        dlqReplayer.replay(dlq);
        return R.ok();
    }

    @PostMapping("/{id}/ignore")
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
