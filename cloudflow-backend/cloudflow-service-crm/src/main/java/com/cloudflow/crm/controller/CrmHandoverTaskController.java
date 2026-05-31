package com.cloudflow.crm.controller;

import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.core.web.MapConverters;
import com.cloudflow.common.idempotent.annotation.RepeatSubmit;
import com.cloudflow.crm.domain.dto.handover.CrmHandoverCloseDTO;
import com.cloudflow.crm.domain.dto.handover.CrmHandoverReassignDTO;
import com.cloudflow.crm.domain.vo.CrmHandoverTaskVO;
import com.cloudflow.crm.service.ICrmHandoverTaskService;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import cn.dev33.satoken.annotation.SaCheckLogin;
import cn.dev33.satoken.annotation.SaCheckPermission;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * 员工离职交接待办：列表 / 指派 / 关闭。
 */
@RestController
@RequestMapping("/handover-task")
@SaCheckLogin
@RequiredArgsConstructor
public class CrmHandoverTaskController {

    private final ICrmHandoverTaskService crmHandoverTaskService;
    private final ObjectMapper objectMapper;

    @GetMapping("/pending")
    @SaCheckPermission("crm:handover-task:list")
    public R<List<CrmHandoverTaskVO>> pending(@RequestParam(value = "fromOwnerId", required = false) Long fromOwnerId) {
        return R.ok(MapConverters.toVOList(crmHandoverTaskService.listPending(fromOwnerId),
                CrmHandoverTaskVO.class, objectMapper));
    }

    // M0-8: 防重复提交
    @RepeatSubmit
    @PostMapping("/{id}/reassign")
    @SaCheckPermission("crm:handover-task:reassign")
    public R<Void> reassign(@PathVariable("id") Long id, @Validated @RequestBody CrmHandoverReassignDTO dto) {
        try {
            crmHandoverTaskService.reassign(id, dto.getToOwnerId(), dto.getToOwnerName(), dto.getRemark());
            return R.ok();
        } catch (IllegalArgumentException ex) {
            return R.fail(ex.getMessage());
        }
    }

    @PostMapping("/{id}/close")
    @SaCheckPermission("crm:handover-task:close")
    public R<Void> close(@PathVariable("id") Long id, @RequestBody(required = false) CrmHandoverCloseDTO dto) {
        crmHandoverTaskService.close(id, dto == null ? null : dto.getRemark());
        return R.ok();
    }
}
