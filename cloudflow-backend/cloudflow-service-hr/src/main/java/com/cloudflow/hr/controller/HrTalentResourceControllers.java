package com.cloudflow.hr.controller;

import cn.dev33.satoken.annotation.SaCheckPermission;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.core.web.MapConverters;
import com.cloudflow.common.log.annotation.SysLog;
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
import com.cloudflow.hr.domain.vo.talent.HrTalentCalibrationSessionVO;
import com.cloudflow.hr.domain.vo.talent.HrTalentDevelopmentActionVO;
import com.cloudflow.hr.domain.vo.talent.HrTalentParticipantVO;
import com.cloudflow.hr.domain.vo.talent.HrTalentPoolListVO;
import com.cloudflow.hr.domain.vo.talent.HrTalentPoolMemberVO;
import com.cloudflow.hr.domain.vo.talent.HrTalentPoolVO;
import com.cloudflow.hr.domain.vo.talent.HrTalentReviewListVO;
import com.cloudflow.hr.domain.vo.talent.HrTalentReviewVO;
import com.cloudflow.hr.domain.vo.talent.HrTalentSuccessionPlanListVO;
import com.cloudflow.hr.domain.vo.talent.HrTalentSuccessionPlanVO;
import com.cloudflow.hr.domain.vo.talent.HrTalentSuccessorVO;
import com.cloudflow.hr.service.HrTalentArchiveService;
import com.cloudflow.hr.service.HrTalentDevelopmentService;
import com.cloudflow.hr.service.HrTalentPoolService;
import com.cloudflow.hr.service.HrTalentReviewService;
import com.cloudflow.hr.service.HrTalentSuccessionService;
import com.cloudflow.hr.service.HrTypedCrudService;
import com.fasterxml.jackson.databind.ObjectMapper;
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

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;

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

    private final HrTalentReviewService reviewService;
    private final ObjectMapper objectMapper;

    @GetMapping("/reviews")
    @SaCheckPermission("hr:talent:review:list")
    public R<PageResult<HrTalentReviewListVO>> page(@Validated @ModelAttribute HrTalentReviewQueryDTO query) {
        Map<String, Object> raw = reviewService.page(MapConverters.toServiceQuery(query, objectMapper));
        return R.ok(MapConverters.toPageResult(raw, HrTalentReviewListVO.class, objectMapper));
    }

    @GetMapping("/reviews/{id}")
    @SaCheckPermission("hr:talent:review:list")
    public R<HrTalentReviewVO> get(@PathVariable Long id) {
        return R.ok(MapConverters.toVO(reviewService.getReview(id), HrTalentReviewVO.class, objectMapper));
    }

    @SysLog("新增人才盘点活动")
    @PostMapping("/reviews")
    @SaCheckPermission("hr:talent:review:add")
    public R<Long> create(@Validated @RequestBody HrTalentReviewDTO dto) {
        return R.ok(reviewService.createReview(MapConverters.toMap(dto, objectMapper)));
    }

    @SysLog("修改人才盘点活动")
    @PutMapping("/reviews/{id}")
    @SaCheckPermission("hr:talent:review:edit")
    public R<Void> update(@PathVariable Long id, @Validated @RequestBody HrTalentReviewDTO dto) {
        reviewService.updateReview(id, MapConverters.toMap(dto, objectMapper));
        return R.ok();
    }

    @SysLog("拉取业绩快照")
    @PostMapping("/reviews/{id}/snapshot-performance")
    @SaCheckPermission("hr:talent:review:snapshot")
    public R<Integer> snapshot(@PathVariable Long id, @RequestParam Long objectiveId) {
        return R.ok(reviewService.snapshotPerformance(id, objectiveId));
    }

    @SysLog("校准盘点参与人")
    @PatchMapping("/reviews/{id}/participants/{employeeId}")
    @SaCheckPermission("hr:talent:review:calibrate")
    public R<Void> upsertParticipant(@PathVariable Long id,
                                     @PathVariable Long employeeId,
                                     @Validated @RequestBody HrTalentParticipantDTO dto) {
        reviewService.upsertParticipant(id, employeeId, MapConverters.toMap(dto, objectMapper));
        return R.ok();
    }

    @SysLog("九宫格拖拽落格")
    @PatchMapping("/reviews/{id}/participants/{employeeId}/grid-cell")
    @SaCheckPermission("hr:talent:review:calibrate")
    public R<Void> moveGridCell(@PathVariable Long id,
                                @PathVariable Long employeeId,
                                @RequestParam Integer gridCell) {
        reviewService.moveGridCell(id, employeeId, gridCell);
        return R.ok();
    }

    @GetMapping("/reviews/{id}/grid")
    @SaCheckPermission("hr:talent:review:list")
    public R<Map<Integer, List<HrTalentParticipantVO>>> grid(@PathVariable Long id) {
        Map<Integer, List<Map<String, Object>>> raw = reviewService.loadNineBox(id);
        Map<Integer, List<HrTalentParticipantVO>> result = new TreeMap<>();
        raw.forEach((cell, rows) -> {
            List<HrTalentParticipantVO> vos = new ArrayList<>(rows.size());
            for (Map<String, Object> row : rows) {
                vos.add(objectMapper.convertValue(row, HrTalentParticipantVO.class));
            }
            result.put(cell, vos);
        });
        return R.ok(result);
    }

    @SysLog("发起人才盘点发布")
    @PostMapping("/reviews/{id}/publish")
    @SaCheckPermission("hr:talent:review:publish")
    public R<String> publish(@PathVariable Long id) {
        return R.ok(reviewService.publish(id));
    }

    @SysLog("创建校准会议")
    @PostMapping("/reviews/{id}/calibration-sessions")
    @SaCheckPermission("hr:talent:review:session")
    public R<Long> createCalibration(@PathVariable Long id,
                                     @Validated @RequestBody HrTalentCalibrationSessionDTO dto) {
        return R.ok(reviewService.createCalibrationSession(id, MapConverters.toMap(dto, objectMapper)));
    }

    @GetMapping("/reviews/{id}/calibration-sessions")
    @SaCheckPermission("hr:talent:review:session")
    public R<PageResult<HrTalentCalibrationSessionVO>> listCalibrations(@PathVariable Long id) {
        Map<String, Object> raw = reviewService.listCalibrationSessions(id);
        return R.ok(MapConverters.toPageResult(raw, HrTalentCalibrationSessionVO.class, objectMapper));
    }

    @SysLog("修改校准会议")
    @PutMapping("/calibration-sessions/{sessionId}")
    @SaCheckPermission("hr:talent:review:session")
    public R<Void> updateCalibration(@PathVariable Long sessionId,
                                     @Validated @RequestBody HrTalentCalibrationSessionDTO dto) {
        reviewService.updateCalibrationSession(sessionId, MapConverters.toMap(dto, objectMapper));
        return R.ok();
    }
}

@RestController
@RequestMapping("/talent")
@RequiredArgsConstructor
class HrTalentSuccessionController {

    private final HrTalentSuccessionService successionService;
    private final HrTypedCrudService crudService;
    private final ObjectMapper objectMapper;

    @GetMapping("/succession-plans")
    @SaCheckPermission("hr:talent:succession:list")
    public R<PageResult<HrTalentSuccessionPlanListVO>> page(@Validated @ModelAttribute HrTalentSuccessionPlanQueryDTO query) {
        Map<String, Object> raw = successionService.pagePlans(MapConverters.toServiceQuery(query, objectMapper));
        return R.ok(MapConverters.toPageResult(raw, HrTalentSuccessionPlanListVO.class, objectMapper));
    }

    @GetMapping("/succession-plans/{id}")
    @SaCheckPermission("hr:talent:succession:list")
    public R<HrTalentSuccessionPlanVO> get(@PathVariable Long id) {
        return R.ok(MapConverters.toVO(successionService.getPlan(id), HrTalentSuccessionPlanVO.class, objectMapper));
    }

    @SysLog("新增继任计划")
    @PostMapping("/succession-plans")
    @SaCheckPermission("hr:talent:succession:add")
    public R<Long> create(@Validated @RequestBody HrTalentSuccessionPlanDTO dto) {
        return R.ok(successionService.createPlan(MapConverters.toMap(dto, objectMapper)));
    }

    @SysLog("修改继任计划")
    @PutMapping("/succession-plans/{id}")
    @SaCheckPermission("hr:talent:succession:edit")
    public R<Void> update(@PathVariable Long id, @Validated @RequestBody HrTalentSuccessionPlanDTO dto) {
        successionService.updatePlan(id, MapConverters.toMap(dto, objectMapper));
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
    @PostMapping("/succession-plans/{id}/successors")
    @SaCheckPermission("hr:talent:succession:nominate")
    public R<Long> addSuccessor(@PathVariable Long id, @Validated @RequestBody HrTalentSuccessorDTO dto) {
        return R.ok(successionService.addSuccessor(id, MapConverters.toMap(dto, objectMapper)));
    }

    @SysLog("移除继任人")
    @DeleteMapping("/succession-plans/successors/{successorId}")
    @SaCheckPermission("hr:talent:succession:nominate")
    public R<Void> removeSuccessor(@PathVariable Long successorId) {
        successionService.removeSuccessor(successorId);
        return R.ok();
    }

    @SysLog("发起继任计划发布")
    @PostMapping("/succession-plans/{id}/publish")
    @SaCheckPermission("hr:talent:succession:publish")
    public R<String> publish(@PathVariable Long id) {
        return R.ok(successionService.publish(id));
    }
}

@RestController
@RequestMapping("/talent")
@RequiredArgsConstructor
class HrTalentPoolController {

    private final HrTalentPoolService poolService;
    private final HrTypedCrudService crudService;
    private final ObjectMapper objectMapper;

    @GetMapping("/pools")
    @SaCheckPermission("hr:talent:pool:list")
    public R<PageResult<HrTalentPoolListVO>> page(@Validated @ModelAttribute HrTalentPoolQueryDTO query) {
        Map<String, Object> raw = poolService.pagePools(MapConverters.toServiceQuery(query, objectMapper));
        return R.ok(MapConverters.toPageResult(raw, HrTalentPoolListVO.class, objectMapper));
    }

    @SysLog("新增人才池")
    @PostMapping("/pools")
    @SaCheckPermission("hr:talent:pool:add")
    public R<Long> create(@Validated @RequestBody HrTalentPoolDTO dto) {
        return R.ok(poolService.createPool(MapConverters.toMap(dto, objectMapper)));
    }

    @SysLog("修改人才池")
    @PutMapping("/pools/{id}")
    @SaCheckPermission("hr:talent:pool:edit")
    public R<Void> update(@PathVariable Long id, @Validated @RequestBody HrTalentPoolDTO dto) {
        poolService.updatePool(id, MapConverters.toMap(dto, objectMapper));
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
        return R.ok(MapConverters.toVOList(poolService.listMembers(id), HrTalentPoolMemberVO.class, objectMapper));
    }

    @SysLog("加入人才池")
    @PostMapping("/pools/{id}/members")
    @SaCheckPermission("hr:talent:pool:join")
    public R<Void> joinPool(@PathVariable Long id, @Validated @RequestBody HrTalentPoolJoinDTO dto) {
        poolService.joinPool(id, dto.getEmployeeId(), dto.getSourceReviewId());
        return R.ok();
    }

    @SysLog("退出人才池")
    @DeleteMapping("/pools/{id}/members/{employeeId}")
    @SaCheckPermission("hr:talent:pool:exit")
    public R<Void> exitPool(@PathVariable Long id,
                            @PathVariable Long employeeId,
                            @RequestParam(required = false) String reason) {
        poolService.exitPool(id, employeeId, reason);
        return R.ok();
    }
}

@RestController
@RequestMapping("/talent")
@RequiredArgsConstructor
class HrTalentDevelopmentController {

    private final HrTalentDevelopmentService developmentService;
    private final HrTypedCrudService crudService;
    private final ObjectMapper objectMapper;

    @GetMapping("/development")
    @SaCheckPermission("hr:talent:dev:list")
    public R<PageResult<HrTalentDevelopmentActionVO>> page(@Validated @ModelAttribute HrTalentDevelopmentActionQueryDTO query) {
        Map<String, Object> raw = developmentService.pageActions(MapConverters.toServiceQuery(query, objectMapper));
        return R.ok(MapConverters.toPageResult(raw, HrTalentDevelopmentActionVO.class, objectMapper));
    }

    @SysLog("新增培养行动")
    @PostMapping("/development")
    @SaCheckPermission("hr:talent:dev:add")
    public R<Long> create(@Validated @RequestBody HrTalentDevelopmentActionDTO dto) {
        return R.ok(developmentService.createAction(MapConverters.toMap(dto, objectMapper)));
    }

    @SysLog("修改培养行动")
    @PutMapping("/development/{id}")
    @SaCheckPermission("hr:talent:dev:edit")
    public R<Void> update(@PathVariable Long id, @Validated @RequestBody HrTalentDevelopmentActionDTO dto) {
        developmentService.updateAction(id, MapConverters.toMap(dto, objectMapper));
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
        developmentService.completeAction(id, dto.getEvaluationScore(), dto.getEvaluationNotes());
        return R.ok();
    }
}

@RestController
@RequestMapping("/talent")
@RequiredArgsConstructor
class HrTalentArchiveController {

    private final HrTalentArchiveService archiveService;

    @GetMapping("/archive/mine")
    @SaCheckPermission("hr:talent:archive:mine")
    public R<?> mine() {
        return R.ok(archiveService.getMyArchive());
    }

    @GetMapping("/archive/employees/{employeeId}")
    @SaCheckPermission("hr:talent:archive:view")
    public R<?> archive(@PathVariable Long employeeId) {
        return R.ok(archiveService.getArchive(employeeId));
    }
}
