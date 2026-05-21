package com.cloudflow.hr.controller;

import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.security.annotation.Inner;
import com.cloudflow.hr.domain.vo.HrWorkplaceReminderVO;
import com.cloudflow.hr.service.HrWorkplaceReminderQueryService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * HR 工作台提醒数据源（供 OA 工作台跨服务聚合）。
 * 仅允许经过网关的内部调用（X-Inner-Call + 来源服务白名单）。
 */
@RestController
@RequestMapping("/inner/hr/workplace")
@RequiredArgsConstructor
public class HrInnerWorkplaceController {

    private static final String OA_SERVICE = "cloudflow-service-oa";

    private final HrWorkplaceReminderQueryService reminderQueryService;

    @Inner(allowedServices = OA_SERVICE)
    @GetMapping("/reminders")
    public R<List<HrWorkplaceReminderVO>> listReminders(
            @RequestParam(value = "userId", required = false) Long userId,
            @RequestParam(value = "expiringDays", defaultValue = "30") Integer expiringDays,
            @RequestParam(value = "limit", defaultValue = "10") Integer limit) {
        return R.ok(reminderQueryService.listReminders(userId, expiringDays, limit));
    }
}
