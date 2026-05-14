package com.cloudflow.crm.controller;

import com.cloudflow.common.core.domain.R;
import com.cloudflow.crm.domain.CrmHandoverTask;
import com.cloudflow.crm.service.CrmHandoverTaskService;
import lombok.RequiredArgsConstructor;
import cn.dev33.satoken.annotation.SaCheckLogin;
import cn.dev33.satoken.annotation.SaCheckPermission;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

/**
 * 员工离职交接待办：列表 / 指派 / 关闭。
 */
@RestController
@RequestMapping("/handover-task")
@SaCheckLogin
@RequiredArgsConstructor
public class CrmHandoverTaskController {

    private final CrmHandoverTaskService handoverTaskService;

    @GetMapping("/pending")
    @SaCheckPermission("crm:handover-task:list")
    public R<List<CrmHandoverTask>> pending(@RequestParam(value = "fromOwnerId", required = false) Long fromOwnerId) {
        return R.ok(handoverTaskService.listPending(fromOwnerId));
    }

    @PostMapping("/{id}/reassign")
    @SaCheckPermission("crm:handover-task:reassign")
    public R<Void> reassign(@PathVariable("id") Long id, @RequestBody Map<String, Object> body) {
        try {
            Long toOwnerId = body.get("toOwnerId") == null ? null : Long.valueOf(String.valueOf(body.get("toOwnerId")));
            String toOwnerName = body.get("toOwnerName") == null ? null : String.valueOf(body.get("toOwnerName"));
            String remark = body.get("remark") == null ? null : String.valueOf(body.get("remark"));
            handoverTaskService.reassign(id, toOwnerId, toOwnerName, remark);
            return R.ok();
        } catch (IllegalArgumentException ex) {
            return R.fail(ex.getMessage());
        }
    }

    @PostMapping("/{id}/close")
    @SaCheckPermission("crm:handover-task:close")
    public R<Void> close(@PathVariable("id") Long id, @RequestBody(required = false) Map<String, Object> body) {
        String remark = body == null || body.get("remark") == null ? null : String.valueOf(body.get("remark"));
        handoverTaskService.close(id, remark);
        return R.ok();
    }
}
