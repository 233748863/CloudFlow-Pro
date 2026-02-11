package cn.joywon.poco.merchant.CouponModule.controller;

import cn.joywon.poco.common.core.util.R;
import cn.joywon.poco.merchant.Common.page.PageQueryVO;
import cn.joywon.poco.merchant.CouponModule.dto.*;
import cn.joywon.poco.merchant.CouponModule.entity.JointMarketingRebateRecord;
import cn.joywon.poco.merchant.CouponModule.service.*;
import cn.joywon.poco.merchant.CouponModule.vo.*;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/coupon/joint-marketing")
@RequiredArgsConstructor
@Tag(name = "联合营销管理")
@Validated
public class JointMarketingController {

    private final IJointMarketingPlanService planService;
    private final IJointMarketingRuleService ruleService;
    private final IJointMarketingParticipantService participantService;
    private final IJointMarketingAllocationService allocationService;
    private final IJointMarketingSettlementService settlementService;

    @PostMapping("/plan/create")
    @Operation(summary = "创建联合营销计划")
    public R<Long> createPlan(@RequestBody @Validated JointMarketingPlanCreateDTO dto) {
        return planService.createPlan(dto);
    }

    @PostMapping("/plan/update")
    @Operation(summary = "更新联合营销计划")
    public R<Boolean> updatePlan(@RequestBody @Validated JointMarketingPlanUpdateDTO dto) {
        return planService.updatePlan(dto);
    }

    @PostMapping("/plan/publish")
    @Operation(summary = "新: 发布联合营销计划")
    public R<Boolean> publishPlan(@RequestParam Long planId) {
        planService.publishPlan(planId);
        participantService.publishPlan(planId);
        return R.ok();
    }

    @PostMapping("/plan/close")
    @Operation(summary = "关闭联合营销计划")
    public R<Boolean> closePlan(@RequestParam Long planId) {
        return planService.closePlan(planId);
    }

    @GetMapping("/plan/detail")
    @Operation(summary = "获取联合营销计划详情")
    public R<JointMarketingPlanVO> getPlanDetail(@RequestParam Long planId) {
        return planService.getPlanDetail(planId);
    }

    @PostMapping("/plan/page")
    @Operation(summary = "分页查询联合营销计划(商家创建/发布的)")
    public R<PageQueryVO<JointMarketingPlanVO>> pagePlan(@RequestBody JointMarketingPlanPageDTO dto) {
        return planService.pagePlan(dto);
    }

    @PostMapping("/plan/query")
    @Operation(summary = "新: 分页查询联合营销计划")
    public R<PageQueryVO<JointMarketingPlanVO>> queryPlans(@RequestBody JointMarketingPlanPageDTO dto) {
        return planService.queryPlans(dto);
    }

    @PostMapping("/rule/create")
    @Operation(summary = "创建联合营销规则")
    public R<Long> createRule(@RequestBody @Validated JointMarketingRuleCreateDTO dto) {
        return ruleService.createRule(dto);
    }

    @PostMapping("/rule/update")
    @Operation(summary = "更新联合营销规则")
    public R<Boolean> updateRule(@RequestBody @Validated JointMarketingRuleUpdateDTO dto) {
        return ruleService.updateRule(dto);
    }

    @GetMapping("/rule/list")
    @Operation(summary = "查询计划下的规则列表")
    public R<List<JointMarketingRuleVO>> listRules(@RequestParam Long planId) {
        return ruleService.listRulesByPlanId(planId);
    }

    @PostMapping("/rule/delete")
    @Operation(summary = "删除联合营销规则")
    public R<Boolean> deleteRule(@RequestParam Long ruleId) {
        return ruleService.deleteRule(ruleId);
    }

    @GetMapping("/plan/statistics")
    @Operation(summary = "获取联合营销计划统计数据")
    public R<JointMarketingStatisticsVO> getStatistics(@RequestParam Long planId) {
        return planService.getStatistics(planId);
    }

    @PostMapping("/plan/apply/join/list")
    @Operation(summary = "新: 查询我可申请加入的联合营销计划列表")
    public R<PageQueryVO<JointMarketingPlanVO>> queryApplyJoinPlanList(@RequestBody JointMarketingApplyJoinPlanDTO dto) {
        return planService.queryApplyJoinPlanList(dto);
    }

    @PostMapping("/participant/apply/join")
    @Operation(summary = "新: 申请加入联合营销计划")
    public R<?> applyJoinPlan(@RequestBody @Valid JointMarketingParticipantCreateDTO dto) {
        return participantService.applyJoinPlan(dto);
    }

    @PutMapping("/participant/handle/join")
    @Operation(summary = "新: 处理加入联合营销计划申请")
    public R<?> handleApplyJoin(@RequestParam("participantId") String participantId,
                                @RequestParam("handleResult") Boolean handleResult) {
        return participantService.handleApplyJoin(Long.valueOf(participantId), handleResult);
    }

    @PostMapping("/participant/invite")
    @Operation(summary = "新: 邀请商家参与联合营销")
    public R<Boolean> inviteParticipant(@RequestBody @Validated JointMarketingParticipantCreateDTO dto) {
        return participantService.inviteParticipant(dto);
    }

    @PostMapping("/participant/accept")
    @Operation(summary = "接受联合营销邀请")
    public R<Boolean> acceptInvitation(@RequestParam Long participantId) {
        return participantService.acceptInvitation(participantId);
    }

    @PostMapping("/participant/reject")
    @Operation(summary = "拒绝联合营销邀请")
    public R<Boolean> rejectInvitation(@RequestParam Long participantId) {
        return participantService.rejectInvitation(participantId);
    }

    @GetMapping("/participant/apply/join/list")
    @Operation(summary = "新: 获取联合营销计划申请加入列表")
    public R<PageQueryVO<JointMarketingApplyJoinVO>> getApplyJoinList(@RequestParam("planId") String planId,
                                                                      @RequestParam("pageNum") Integer pageNum,
                                                                      @RequestParam("pageSize") Integer pageSize) {
        return participantService.getApplyJoinList(Long.valueOf(planId), pageNum, pageSize);
    }

    @PostMapping("/participant/invite/record")
    @Operation(summary = "新: 查询邀请我加入的联合营销参与记录")
    public R<PageQueryVO<JointMarketingInviteRecordVO>> inviteRecord(@RequestBody JointMarketingInviteQueryDTO dto) {
        return participantService.inviteRecord(dto);
    }

    @PostMapping("/settlement/execute")
    @Operation(summary = "新: 手动执行结算")
    public R<?> executeSettlement(@RequestBody JointMarketingSettlementExecuteDTO dto) {
        return settlementService.executeSettlement(dto);
    }

    @PostMapping("/settlement/retry")
    @Operation(summary = "新: 重试失败的结算记录")
    public R<?> retrySettlement(@RequestBody @Valid SettlementRetryDTO dto) {
        return settlementService.retrySettlement(dto);
    }

    @GetMapping("/settlement/status")
    @Operation(summary = "新: 获取结算任务状态")
    public R<SettlementStatusVO> getSettlementStatus(@RequestParam("batchId") String batchId) {
        return settlementService.getSettlementStatus(batchId);
    }

    @PostMapping("/settlement/cancel")
    @Operation(summary = "新: 取消结算任务")
    public R<Boolean> cancelSettlement(@RequestParam String batchId) {
        return settlementService.cancelSettlement(batchId);
    }

    @PostMapping("/record/page")
    @Operation(summary = "分页查询联合营销返利记录")
    public R<PageQueryVO<JointMarketingRebateRecord>> pageRebateRecord(@RequestBody @Validated JointMarketingRebateRecordPageDTO dto) {
        return settlementService.pageRebateRecord(dto);
    }

    @PostMapping("/participant/quit")
    @Operation(summary = "退出联合营销计划")
    public R<Boolean> quitPlan(@RequestParam Long planId) {
        return participantService.quitPlan(planId);
    }

    @PostMapping("/participant/remove")
    @Operation(summary = "移除联合营销参与者")
    public R<Boolean> removeParticipant(@RequestParam Long participantId) {
        return participantService.removeParticipant(participantId);
    }

    @PostMapping("/participant/page")
    @Operation(summary = "新: 分页查询联合营销参与者")
    public R<PageQueryVO<JointMarketingParticipantVO>> pageParticipant(@RequestBody JointMarketingParticipantPageDTO dto) {
        return participantService.pageParticipant(dto);
    }

    @DeleteMapping("/allocation/delete")
    @Operation(summary = "新: 删除分润配置")
    public R<Boolean> deleteAllocation(@RequestParam String allocationId) {
        return allocationService.deleteAllocation(allocationId);
    }

    @PostMapping("/allocation/update")
    @Operation(summary = "新: 更新分润配置")
    public R<Boolean> updateAllocation(@RequestBody @Validated JointMarketingAllocationUpdateDTO dto) {
        return allocationService.updateAllocation(dto);
    }

    @GetMapping("/allocation/list")
    @Operation(summary = "新: 查询规则下的分润配置列表")
    public R<List<JointMarketingAllocationVO>> listAllocations(@RequestParam("ruleId") String ruleId) {
        return allocationService.listAllocationsByRuleId(Long.valueOf(ruleId));
    }

}
