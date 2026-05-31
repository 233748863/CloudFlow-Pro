package com.cloudflow.hr.controller;

import cn.dev33.satoken.annotation.SaCheckPermission;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.log.annotation.SysLog;
import com.cloudflow.common.idempotent.annotation.RepeatSubmit;
import com.cloudflow.hr.domain.dto.talent.HrTalentCalibrationSessionDTO;
import com.cloudflow.hr.domain.dto.talent.HrTalentDevelopmentActionDTO;
import com.cloudflow.hr.domain.dto.talent.HrTalentDevelopmentActionQueryDTO;
import com.cloudflow.hr.domain.dto.talent.HrTalentDevelopmentCompleteDTO;
import com.cloudflow.hr.domain.dto.talent.HrTalentParticipantDTO;
import com.cloudflow.hr.domain.dto.talent.HrTalentPoolDTO;
import com.cloudflow.hr.domain.dto.talent.HrTalentPoolJoinDTO;
import com.cloudflow.hr.domain.dto.talent.HrTalentPoolQueryDTO;
import com.cloudflow.hr.domain.dto.talent.HrTalentReviewDTO;
import com.cloudflow.hr.domain.dto.talent.HrTalentReviewQueryDTO;
import com.cloudflow.hr.domain.dto.talent.HrTalentSuccessionPlanDTO;
import com.cloudflow.hr.domain.dto.talent.HrTalentSuccessionPlanQueryDTO;
import com.cloudflow.hr.domain.dto.talent.HrTalentSuccessorDTO;
import com.cloudflow.hr.domain.entity.HrTalentDevelopmentAction;
import com.cloudflow.hr.domain.entity.HrTalentPool;
import com.cloudflow.hr.domain.entity.HrTalentSuccessionPlan;
import com.cloudflow.hr.domain.vo.talent.HrTalentArchiveVO;
import com.cloudflow.hr.domain.vo.talent.HrTalentCalibrationSessionVO;
import com.cloudflow.hr.domain.vo.talent.HrTalentDevelopmentActionVO;
import com.cloudflow.hr.domain.vo.talent.HrTalentNineGridVO;
import com.cloudflow.hr.domain.vo.talent.HrTalentParticipantVO;
import com.cloudflow.hr.domain.vo.talent.HrTalentPoolListVO;
import com.cloudflow.hr.domain.vo.talent.HrTalentPoolMemberVO;
import com.cloudflow.hr.domain.vo.talent.HrTalentReviewListVO;
import com.cloudflow.hr.domain.vo.talent.HrTalentReviewVO;
import com.cloudflow.hr.domain.vo.talent.HrTalentSuccessionPlanListVO;
import com.cloudflow.hr.domain.vo.talent.HrTalentSuccessionPlanVO;
import com.cloudflow.hr.service.IHrTalentArchiveService;
import com.cloudflow.hr.service.IHrTalentDevelopmentService;
import com.cloudflow.hr.service.IHrTalentPoolService;
import com.cloudflow.hr.service.IHrTalentReviewService;
import com.cloudflow.hr.service.IHrTalentSuccessionService;
import com.cloudflow.hr.service.HrTypedCrudService;
import lombok.RequiredArgsConstructor;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

/**
 * HR 人才盘点（Talent Review）多 Controller 聚合文件。
 *
 * <p>按业务子域拆为 5 个独立 @RestController，共享 {@code /talent} base path：
 * 盘点（reviews/grid/calibration）、继任（succession-plans/successors）、
 * 人才池（pools/members）、培养行动（development）、人才档案（archive）。
 */
@RestController
@RequestMapping("/talent")
@RequiredArgsConstructor
class HrTalentReviewController {

    private final IHrTalentReviewService hrTalentReviewService;

    @GetMapping("/reviews")
    @SaCheckPermission("hr:talent:review:list")
    public R<PageResult<HrTalentReviewListVO>> page(@Validated @ModelAttribute HrTalentReviewQueryDTO query) {
        return R.ok(hrTalentReviewService.page(query));
    }

    @GetMapping("/reviews/{id}")
    @SaCheckPermission("hr:talent:review:list")
    public R<HrTalentReviewVO> get(@PathVariable Long id) {
        return R.ok(hrTalentReviewService.getReview(id));
    }

    @SysLog("新增人才盘点活动")
    @PostMapping("/reviews")
    @SaCheckPermission("hr:talent:review:add")
    public R<Long> create(@Validated @RequestBody HrTalentReviewDTO dto) {
        return R.ok(hrTalentReviewService.createReview(dto));
    }

    @SysLog("修改人才盘点活动")
    @PutMapping("/reviews/{id}")
    @SaCheckPermission("hr:talent:review:edit")
    public R<Void> update(@PathVariable Long id, @Validated @RequestBody HrTalentReviewDTO dto) {
        hrTalentReviewService.updateReview(id, dto);
        return R.ok();
    }

    @SysLog("拉取业绩快照")
    @PostMapping("/reviews/{id}/snapshot-performance")
    @SaCheckPermission("hr:talent:review:snapshot")
    public R<Integer> snapshot(@PathVariable Long id, @RequestParam Long objectiveId) {
        return R.ok(hrTalentReviewService.snapshotPerformance(id, objectiveId));
    }

    @SysLog("校准盘点参与人")
    @PatchMapping("/reviews/{id}/participants/{employeeId}")
    @SaCheckPermission("hr:talent:review:calibrate")
    public R<Void> upsertParticipant(@PathVariable Long id,
                                     @PathVariable Long employeeId,
                                     @Validated @RequestBody HrTalentParticipantDTO dto) {
        hrTalentReviewService.upsertParticipant(id, employeeId, dto);
        return R.ok();
    }

    @SysLog("九宫格拖拽落格")
    @PatchMapping("/reviews/{id}/participants/{employeeId}/grid-cell")
    @SaCheckPermission("hr:talent:review:calibrate")
    public R<Void> moveGridCell(@PathVariable Long id,
                                @PathVariable Long employeeId,
                                @RequestParam Integer gridCell) {
        hrTalentReviewService.moveGridCell(id, employeeId, gridCell);
        return R.ok();
    }

    @GetMapping("/reviews/{id}/grid")
    @SaCheckPermission("hr:talent:review:list")
    public R<HrTalentNineGridVO> grid(@PathVariable Long id) {
        Map<Integer, List<HrTalentParticipantVO>> cells = hrTalentReviewService.loadNineBox(id);
        HrTalentNineGridVO vo = new HrTalentNineGridVO();
        vo.setCells(cells);
        return R.ok(vo);
    }

    @SysLog("发起人才盘点发布")
    // M0-8: 防重复提交
    @RepeatSubmit
    @PostMapping("/reviews/{id}/publish")
    @SaCheckPermission("hr:talent:review:publish")
    public R<String> publish(@PathVariable Long id) {
        return R.ok(hrTalentReviewService.publish(id));
    }

    @SysLog("创建校准会议")
    @PostMapping("/reviews/{id}/calibration-sessions")
    @SaCheckPermission("hr:talent:review:session")
    public R<Long> createCalibration(@PathVariable Long id,
                                     @Validated @RequestBody HrTalentCalibrationSessionDTO dto) {
        return R.ok(hrTalentReviewService.createCalibrationSession(id, dto));
    }

    @GetMapping("/reviews/{id}/calibration-sessions")
    @SaCheckPermission("hr:talent:review:session")
    public R<PageResult<HrTalentCalibrationSessionVO>> listCalibrations(@PathVariable Long id) {
        return R.ok(hrTalentReviewService.listCalibrationSessions(id));
    }

    @SysLog("修改校准会议")
    @PutMapping("/calibration-sessions/{sessionId}")
    @SaCheckPermission("hr:talent:review:session")
    public R<Void> updateCalibration(@PathVariable Long sessionId,
                                     @Validated @RequestBody HrTalentCalibrationSessionDTO dto) {
        hrTalentReviewService.updateCalibrationSession(sessionId, dto);
        return R.ok();
    }
}

@RestController
@RequestMapping("/talent")
@RequiredArgsConstructor
class HrTalentSuccessionController {

    private final IHrTalentSuccessionService hrTalentSuccessionService;
    private final HrTypedCrudService crudService;

    @GetMapping("/succession-plans")
    @SaCheckPermission("hr:talent:succession:list")
    public R<PageResult<HrTalentSuccessionPlanListVO>> page(@Validated @ModelAttribute HrTalentSuccessionPlanQueryDTO query) {
        return R.ok(hrTalentSuccessionService.pagePlans(query));
    }

    @GetMapping("/succession-plans/{id}")
    @SaCheckPermission("hr:talent:succession:list")
    public R<HrTalentSuccessionPlanVO> get(@PathVariable Long id) {
        return R.ok(hrTalentSuccessionService.getPlan(id));
    }

    @SysLog("新增继任计划")
    @PostMapping("/succession-plans")
    @SaCheckPermission("hr:talent:succession:add")
    public R<Long> create(@Validated @RequestBody HrTalentSuccessionPlanDTO dto) {
        return R.ok(hrTalentSuccessionService.createPlan(dto));
    }

    @SysLog("修改继任计划")
    @PutMapping("/succession-plans/{id}")
    @SaCheckPermission("hr:talent:succession:edit")
    public R<Void> update(@PathVariable Long id, @Validated @RequestBody HrTalentSuccessionPlanDTO dto) {
        hrTalentSuccessionService.updatePlan(id, dto);
        return R.ok();
    }

    @SysLog("删除继任计划")
    @DeleteMapping("/succession-plans/{id}")
    @SaCheckPermission("hr:talent:succession:remove")
    public R<Void> delete(@PathVariable Long id) {
        crudService.delete(HrTalentSuccessionPlan.class, id);
        return R.ok();
    }

    @SysLog("提名继任人")
    // M0-8: 防重复提交
    @RepeatSubmit
    @PostMapping("/succession-plans/{id}/successors")
    @SaCheckPermission("hr:talent:succession:nominate")
    public R<Long> addSuccessor(@PathVariable Long id, @Validated @RequestBody HrTalentSuccessorDTO dto) {
        return R.ok(hrTalentSuccessionService.addSuccessor(id, dto));
    }

    @SysLog("移除继任人")
    @DeleteMapping("/succession-plans/successors/{successorId}")
    @SaCheckPermission("hr:talent:succession:nominate")
    public R<Void> removeSuccessor(@PathVariable Long successorId) {
        hrTalentSuccessionService.removeSuccessor(successorId);
        return R.ok();
    }

    @SysLog("发起继任计划发布")
    // M0-8: 防重复提交
    @RepeatSubmit
    @PostMapping("/succession-plans/{id}/publish")
    @SaCheckPermission("hr:talent:succession:publish")
    public R<String> publish(@PathVariable Long id) {
        return R.ok(hrTalentSuccessionService.publish(id));
    }
}

@RestController
@RequestMapping("/talent")
@RequiredArgsConstructor
class HrTalentPoolController {

    private final IHrTalentPoolService hrTalentPoolService;
    private final HrTypedCrudService crudService;

    @GetMapping("/pools")
    @SaCheckPermission("hr:talent:pool:list")
    public R<PageResult<HrTalentPoolListVO>> page(@Validated @ModelAttribute HrTalentPoolQueryDTO query) {
        return R.ok(hrTalentPoolService.pagePools(query));
    }

    @SysLog("新增人才池")
    @PostMapping("/pools")
    @SaCheckPermission("hr:talent:pool:add")
    public R<Long> create(@Validated @RequestBody HrTalentPoolDTO dto) {
        return R.ok(hrTalentPoolService.createPool(dto));
    }

    @SysLog("修改人才池")
    @PutMapping("/pools/{id}")
    @SaCheckPermission("hr:talent:pool:edit")
    public R<Void> update(@PathVariable Long id, @Validated @RequestBody HrTalentPoolDTO dto) {
        hrTalentPoolService.updatePool(id, dto);
        return R.ok();
    }

    @SysLog("删除人才池")
    @DeleteMapping("/pools/{id}")
    @SaCheckPermission("hr:talent:pool:remove")
    public R<Void> delete(@PathVariable Long id) {
        crudService.delete(HrTalentPool.class, id);
        return R.ok();
    }

    @GetMapping("/pools/{id}/members")
    @SaCheckPermission("hr:talent:pool:list")
    public R<List<HrTalentPoolMemberVO>> listMembers(@PathVariable Long id) {
        return R.ok(hrTalentPoolService.listMembers(id));
    }

    @SysLog("加入人才池")
    @PostMapping("/pools/{id}/members")
    @SaCheckPermission("hr:talent:pool:join")
    public R<Void> joinPool(@PathVariable Long id, @Validated @RequestBody HrTalentPoolJoinDTO dto) {
        hrTalentPoolService.joinPool(id, dto.getEmployeeId(), dto.getSourceReviewId());
        return R.ok();
    }

    @SysLog("退出人才池")
    @DeleteMapping("/pools/{id}/members/{employeeId}")
    @SaCheckPermission("hr:talent:pool:exit")
    public R<Void> exitPool(@PathVariable Long id,
                            @PathVariable Long employeeId,
                            @RequestParam(required = false) String reason) {
        hrTalentPoolService.exitPool(id, employeeId, reason);
        return R.ok();
    }
}

@RestController
@RequestMapping("/talent")
@RequiredArgsConstructor
class HrTalentDevelopmentController {

    private final IHrTalentDevelopmentService hrTalentDevelopmentService;
    private final HrTypedCrudService crudService;

    @GetMapping("/development")
    @SaCheckPermission("hr:talent:dev:list")
    public R<PageResult<HrTalentDevelopmentActionVO>> page(@Validated @ModelAttribute HrTalentDevelopmentActionQueryDTO query) {
        return R.ok(hrTalentDevelopmentService.pageActions(query));
    }

    @SysLog("新增培养行动")
    @PostMapping("/development")
    @SaCheckPermission("hr:talent:dev:add")
    public R<Long> create(@Validated @RequestBody HrTalentDevelopmentActionDTO dto) {
        return R.ok(hrTalentDevelopmentService.createAction(dto));
    }

    @SysLog("修改培养行动")
    @PutMapping("/development/{id}")
    @SaCheckPermission("hr:talent:dev:edit")
    public R<Void> update(@PathVariable Long id, @Validated @RequestBody HrTalentDevelopmentActionDTO dto) {
        hrTalentDevelopmentService.updateAction(id, dto);
        return R.ok();
    }

    @SysLog("删除培养行动")
    @DeleteMapping("/development/{id}")
    @SaCheckPermission("hr:talent:dev:remove")
    public R<Void> delete(@PathVariable Long id) {
        crudService.delete(HrTalentDevelopmentAction.class, id);
        return R.ok();
    }

    @SysLog("完成培养行动")
    @PostMapping("/development/{id}/complete")
    @SaCheckPermission("hr:talent:dev:complete")
    public R<Void> complete(@PathVariable Long id, @Validated @RequestBody HrTalentDevelopmentCompleteDTO dto) {
        hrTalentDevelopmentService.completeAction(id, dto.getEvaluationScore(), dto.getEvaluationNotes());
        return R.ok();
    }
}

@RestController
@RequestMapping("/talent")
@RequiredArgsConstructor
class HrTalentArchiveController {

    private final IHrTalentArchiveService hrTalentArchiveService;

    @GetMapping("/archive/mine")
    @SaCheckPermission("hr:talent:archive:mine")
    public R<HrTalentArchiveVO> mine() {
        return R.ok(hrTalentArchiveService.getMyArchive());
    }

    @GetMapping("/archive/employees/{employeeId}")
    @SaCheckPermission("hr:talent:archive:view")
    public R<HrTalentArchiveVO> archive(@PathVariable Long employeeId) {
        return R.ok(hrTalentArchiveService.getArchive(employeeId));
    }
}
