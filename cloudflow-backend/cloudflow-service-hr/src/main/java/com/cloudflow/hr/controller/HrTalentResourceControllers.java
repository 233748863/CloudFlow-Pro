package com.cloudflow.hr.controller;

import cn.dev33.satoken.annotation.SaCheckPermission;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.log.annotation.SysLog;
import com.cloudflow.hr.domain.entity.HrTalentDevelopmentAction;
import com.cloudflow.hr.domain.entity.HrTalentPool;
import com.cloudflow.hr.domain.entity.HrTalentSuccessionPlan;
import com.cloudflow.hr.service.HrTalentArchiveService;
import com.cloudflow.hr.service.HrTalentDevelopmentService;
import com.cloudflow.hr.service.HrTalentPoolService;
import com.cloudflow.hr.service.HrTalentReviewService;
import com.cloudflow.hr.service.HrTalentSuccessionService;
import com.cloudflow.hr.service.HrTypedCrudService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.math.BigDecimal;
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

    private final HrTalentReviewService reviewService;

    @GetMapping("/reviews")
    @SaCheckPermission("hr:talent:review:list")
    public R<?> page(@RequestParam Map<String, Object> query) {
        return R.ok(reviewService.page(query));
    }

    @GetMapping("/reviews/{id}")
    @SaCheckPermission("hr:talent:review:list")
    public R<?> get(@PathVariable Long id) {
        return R.ok(reviewService.getReview(id));
    }

    @SysLog("新增人才盘点活动")
    @PostMapping("/reviews")
    @SaCheckPermission("hr:talent:review:add")
    public R<Long> create(@RequestBody Map<String, Object> payload) {
        return R.ok(reviewService.createReview(payload));
    }

    @SysLog("修改人才盘点活动")
    @PutMapping("/reviews/{id}")
    @SaCheckPermission("hr:talent:review:edit")
    public R<Void> update(@PathVariable Long id, @RequestBody Map<String, Object> payload) {
        reviewService.updateReview(id, payload);
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
                                     @RequestBody Map<String, Object> payload) {
        reviewService.upsertParticipant(id, employeeId, payload);
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
    public R<?> grid(@PathVariable Long id) {
        return R.ok(reviewService.loadNineBox(id));
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
    public R<Long> createCalibration(@PathVariable Long id, @RequestBody Map<String, Object> payload) {
        return R.ok(reviewService.createCalibrationSession(id, payload));
    }

    @GetMapping("/reviews/{id}/calibration-sessions")
    @SaCheckPermission("hr:talent:review:session")
    public R<?> listCalibrations(@PathVariable Long id) {
        return R.ok(reviewService.listCalibrationSessions(id));
    }

    @SysLog("修改校准会议")
    @PutMapping("/calibration-sessions/{sessionId}")
    @SaCheckPermission("hr:talent:review:session")
    public R<Void> updateCalibration(@PathVariable Long sessionId, @RequestBody Map<String, Object> payload) {
        reviewService.updateCalibrationSession(sessionId, payload);
        return R.ok();
    }
}

@RestController
@RequestMapping("/talent")
@RequiredArgsConstructor
class HrTalentSuccessionController {

    private final HrTalentSuccessionService successionService;
    private final HrTypedCrudService crudService;

    @GetMapping("/succession-plans")
    @SaCheckPermission("hr:talent:succession:list")
    public R<?> page(@RequestParam Map<String, Object> query) {
        return R.ok(successionService.pagePlans(query));
    }

    @GetMapping("/succession-plans/{id}")
    @SaCheckPermission("hr:talent:succession:list")
    public R<?> get(@PathVariable Long id) {
        return R.ok(successionService.getPlan(id));
    }

    @SysLog("新增继任计划")
    @PostMapping("/succession-plans")
    @SaCheckPermission("hr:talent:succession:add")
    public R<Long> create(@RequestBody Map<String, Object> payload) {
        return R.ok(successionService.createPlan(payload));
    }

    @SysLog("修改继任计划")
    @PutMapping("/succession-plans/{id}")
    @SaCheckPermission("hr:talent:succession:edit")
    public R<Void> update(@PathVariable Long id, @RequestBody Map<String, Object> payload) {
        successionService.updatePlan(id, payload);
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
    public R<Long> addSuccessor(@PathVariable Long id, @RequestBody Map<String, Object> payload) {
        return R.ok(successionService.addSuccessor(id, payload));
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

    @GetMapping("/pools")
    @SaCheckPermission("hr:talent:pool:list")
    public R<?> page(@RequestParam Map<String, Object> query) {
        return R.ok(poolService.pagePools(query));
    }

    @SysLog("新增人才池")
    @PostMapping("/pools")
    @SaCheckPermission("hr:talent:pool:add")
    public R<Long> create(@RequestBody Map<String, Object> payload) {
        return R.ok(poolService.createPool(payload));
    }

    @SysLog("修改人才池")
    @PutMapping("/pools/{id}")
    @SaCheckPermission("hr:talent:pool:edit")
    public R<Void> update(@PathVariable Long id, @RequestBody Map<String, Object> payload) {
        poolService.updatePool(id, payload);
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
    public R<List<Map<String, Object>>> listMembers(@PathVariable Long id) {
        return R.ok(poolService.listMembers(id));
    }

    @SysLog("加入人才池")
    @PostMapping("/pools/{id}/members")
    @SaCheckPermission("hr:talent:pool:join")
    public R<Void> joinPool(@PathVariable Long id, @RequestBody Map<String, Object> payload) {
        Long employeeId = ((Number) payload.get("employeeId")).longValue();
        Long sourceReviewId = payload.get("sourceReviewId") == null
                ? null : ((Number) payload.get("sourceReviewId")).longValue();
        poolService.joinPool(id, employeeId, sourceReviewId);
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

    @GetMapping("/development")
    @SaCheckPermission("hr:talent:dev:list")
    public R<?> page(@RequestParam Map<String, Object> query) {
        return R.ok(developmentService.pageActions(query));
    }

    @SysLog("新增培养行动")
    @PostMapping("/development")
    @SaCheckPermission("hr:talent:dev:add")
    public R<Long> create(@RequestBody Map<String, Object> payload) {
        return R.ok(developmentService.createAction(payload));
    }

    @SysLog("修改培养行动")
    @PutMapping("/development/{id}")
    @SaCheckPermission("hr:talent:dev:edit")
    public R<Void> update(@PathVariable Long id, @RequestBody Map<String, Object> payload) {
        developmentService.updateAction(id, payload);
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
    public R<Void> complete(@PathVariable Long id, @RequestBody Map<String, Object> payload) {
        BigDecimal score = payload.get("evaluationScore") == null
                ? null : new BigDecimal(payload.get("evaluationScore").toString());
        String notes = (String) payload.get("evaluationNotes");
        developmentService.completeAction(id, score, notes);
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
