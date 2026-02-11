package cn.joywon.poco.merchant.PlatformModule.controller;

import cn.hutool.core.util.StrUtil;
import cn.joywon.poco.common.core.util.R;
import cn.joywon.poco.common.log.annotation.SysLog;
import cn.joywon.poco.merchant.Common.page.PageQueryVO;
import cn.joywon.poco.merchant.CouponModule.service.IJointMarketingPlanService;
import cn.joywon.poco.merchant.CouponModule.vo.JointMarketingPlanVO;
import cn.joywon.poco.merchant.PlatformModule.dto.JointMarketingPendingDTO;
import cn.joywon.poco.merchant.PlatformModule.dto.JointMarketingPlanAuditDTO;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

@Validated
@RestController
@RequiredArgsConstructor
@Tag(name = "联合营销管理(平台后端)")
@RequestMapping("/platform/joint/marketing")
public class JointMarketingAdminController {

    private final IJointMarketingPlanService jointMarketingPlanService;


    /**
     * 审核联合营销计划
     *
     * @param dto 联合营销计划审核参数
     * @return 响应结果
     */
    @PutMapping("/audit")
    @SysLog(value = "审核联合营销计划")
    @Operation(summary = "审核联合营销计划")
    public R<?> auditPlan(@RequestBody @Valid JointMarketingPlanAuditDTO dto) {
        if (!dto.getApprove()) {
            if (StrUtil.isBlank(dto.getReason())) {
                return R.failed("请填写审核拒绝原因");
            }
        }
        return jointMarketingPlanService.auditPlan(dto);
    }


    /**
     * 获取待审核计划列表
     *
     * @param dto 待审核计划参数
     * @return 响应结果
     */
    @PostMapping("/pending/list")
    @Operation(summary = "获取待审核计划列表")
    public R<PageQueryVO<JointMarketingPlanVO>> getPendingList(@RequestBody JointMarketingPendingDTO dto) {
        return jointMarketingPlanService.getPendingList(dto);
    }


}