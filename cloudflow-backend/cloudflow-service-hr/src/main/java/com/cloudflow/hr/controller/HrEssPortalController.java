package com.cloudflow.hr.controller;

import cn.dev33.satoken.annotation.SaCheckPermission;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.core.web.MapConverters;
import com.cloudflow.hr.domain.vo.ess.HrEssPortalSummaryVO;
import com.cloudflow.hr.service.IHrEssService;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDateTime;

/**
 * ESS（员工自助）门户聚合控制器。
 *
 * <p>{@code GET /ess/portal/summary} 聚合假期余额 / 最新工资条 / 待签合同 / 证明进度 / 未读消息，
 * 供员工自助首页一次拉齐。仅返回当前登录员工的数据，HR 管理员视角不走该端点。
 */
@RestController
@RequestMapping("/ess/portal")
@RequiredArgsConstructor
class HrEssPortalController {

    private final IHrEssService hrEssService;
    private final ObjectMapper objectMapper;

    @GetMapping("/summary")
    @SaCheckPermission("hr:ess:view")
    public R<HrEssPortalSummaryVO> summary() {
        return R.ok(MapConverters.toVO(hrEssService.portalSummary(),
                HrEssPortalSummaryVO.class, objectMapper));
    }
}
