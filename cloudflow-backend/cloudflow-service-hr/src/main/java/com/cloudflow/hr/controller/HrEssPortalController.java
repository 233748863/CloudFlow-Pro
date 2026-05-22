package com.cloudflow.hr.controller;

import cn.dev33.satoken.annotation.SaCheckPermission;
import com.baomidou.mybatisplus.core.conditions.update.UpdateWrapper;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.log.annotation.SysLog;
import com.cloudflow.hr.domain.entity.HrSelfServiceMessage;
import com.cloudflow.hr.mapper.HrSelfServiceMessageMapper;
import com.cloudflow.hr.service.HrEssService;
import com.cloudflow.hr.service.HrEssSupport;
import lombok.RequiredArgsConstructor;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDateTime;
import java.util.Map;

/**
 * ESS（员工自助）门户聚合控制器 + 自助消息已读切换。
 *
 * <p>{@code GET /ess/portal/summary} 聚合假期余额 / 最新工资条 / 待签合同 / 证明进度 / 未读消息，
 * 供员工自助首页一次拉齐。仅返回当前登录员工的数据，HR 管理员视角不走该端点。
 */
@RestController
@RequestMapping("/ess/portal")
@RequiredArgsConstructor
class HrEssPortalController {

    private final HrEssService essService;

    @GetMapping("/summary")
    @SaCheckPermission("hr:ess:view")
    public R<Map<String, Object>> summary() {
        return R.ok(essService.portalSummary());
    }
}

@RestController
@RequestMapping("/ess/messages")
@RequiredArgsConstructor
class HrEssMessageController {

    private final HrSelfServiceMessageMapper messageMapper;
    private final HrEssSupport essSupport;

    @SysLog("HR自助消息标记已读")
    @PostMapping("/{id}/read")
    @SaCheckPermission("hr:ess:view")
    public R<Void> markRead(@PathVariable Long id) {
        HrSelfServiceMessage message = messageMapper.selectById(id);
        if (message == null) {
            return R.ok();
        }
        essSupport.assertOwner(message.getEmployeeId());
        UpdateWrapper<HrSelfServiceMessage> wrapper = new UpdateWrapper<>();
        wrapper.eq("id", id)
                .eq("tenant_id", message.getTenantId())
                .set("read_flag", true)
                .set("update_time", LocalDateTime.now());
        messageMapper.update(null, wrapper);
        return R.ok();
    }

    @SysLog("HR自助消息全部标记已读")
    @PostMapping("/read-all")
    @SaCheckPermission("hr:ess:view")
    public R<Void> markAllRead() {
        Long employeeId = essSupport.currentEmployeeId();
        UpdateWrapper<HrSelfServiceMessage> wrapper = new UpdateWrapper<>();
        wrapper.eq("employee_id", employeeId)
                .eq("read_flag", false)
                .set("read_flag", true)
                .set("update_time", LocalDateTime.now());
        Long tenantId = UserContext.getTenantId();
        if (tenantId != null) {
            wrapper.eq("tenant_id", tenantId);
        }
        if (!StringUtils.hasText(UserContext.getUserName())) {
            // ignore
        }
        messageMapper.update(null, wrapper);
        return R.ok();
    }
}
