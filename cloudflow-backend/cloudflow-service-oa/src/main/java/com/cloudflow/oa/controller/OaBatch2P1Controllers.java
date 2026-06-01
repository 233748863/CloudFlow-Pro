package com.cloudflow.oa.controller;

import cn.dev33.satoken.annotation.SaCheckPermission;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.log.annotation.SysLog;
import com.cloudflow.common.idempotent.annotation.RepeatSubmit;
import com.cloudflow.oa.domain.OaContractMilestone;
import com.cloudflow.oa.domain.OaContractPaymentSchedule;
import com.cloudflow.oa.domain.OaKnowledgeTemplate;
import com.cloudflow.oa.domain.OaMeetingAttendance;
import com.cloudflow.oa.domain.OaMeetingMinutes;
import com.cloudflow.oa.service.IOaContractMilestoneService;
import com.cloudflow.oa.service.IOaKnowledgeTemplateService;
import com.cloudflow.oa.service.IOaMeetingMinutesService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
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
 * OA-P1-1 合同履约 + 付款节点 REST 端点。
 */
@RestController
@RequestMapping("/contract/milestone")
@RequiredArgsConstructor
class OaContractMilestoneController {

    private final IOaContractMilestoneService oaContractMilestoneService;

    @GetMapping("/page")
    @SaCheckPermission("oa:contract:list")
    public R<Page<OaContractMilestone>> pageMilestones(@RequestParam(required = false) Long contractId,
                                                       @RequestParam(required = false) String status,
                                                       @RequestParam(defaultValue = "1") Integer pageNum,
                                                       @RequestParam(defaultValue = "10") Integer pageSize) {
        return R.ok(oaContractMilestoneService.pageMilestones(contractId, status, pageNum, pageSize));
    }

    @GetMapping("/list")
    @SaCheckPermission("oa:contract:list")
    public R<List<OaContractMilestone>> listByContract(@RequestParam Long contractId) {
        return R.ok(oaContractMilestoneService.listByContract(contractId));
    }

    @SysLog("新增合同里程碑")
    // M0-8: 防重复提交
    @RepeatSubmit
    @PostMapping
    @SaCheckPermission("oa:contract:edit")
    public R<Void> add(@RequestBody OaContractMilestone milestone) {
        try {
            return oaContractMilestoneService.saveMilestone(milestone) ? R.ok() : R.fail("新增失败");
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("修改合同里程碑")
    @PutMapping
    @SaCheckPermission("oa:contract:edit")
    public R<Void> edit(@RequestBody OaContractMilestone milestone) {
        return oaContractMilestoneService.updateMilestone(milestone) ? R.ok() : R.fail("更新失败");
    }

    @SysLog("删除合同里程碑")
    @DeleteMapping("/{id}")
    @SaCheckPermission("oa:contract:edit")
    public R<Void> remove(@PathVariable Long id) {
        return oaContractMilestoneService.removeMilestone(id) ? R.ok() : R.fail("删除失败");
    }

    @SysLog("标记合同里程碑完成")
    @PostMapping("/{id}/complete")
    @SaCheckPermission("oa:contract:edit")
    public R<Void> complete(@PathVariable Long id,
                            @RequestParam(required = false) String remark) {
        return oaContractMilestoneService.completeMilestone(id, remark) ? R.ok() : R.fail("完成失败");
    }
}

@RestController
@RequestMapping("/contract/payment")
@RequiredArgsConstructor
class OaContractPaymentScheduleController {

    private final IOaContractMilestoneService oaContractMilestoneService;

    @GetMapping("/page")
    @SaCheckPermission("oa:contract:list")
    public R<Page<OaContractPaymentSchedule>> pagePayments(@RequestParam(required = false) Long contractId,
                                                            @RequestParam(required = false) String status,
                                                            @RequestParam(defaultValue = "1") Integer pageNum,
                                                            @RequestParam(defaultValue = "10") Integer pageSize) {
        return R.ok(oaContractMilestoneService.pagePayments(contractId, status, pageNum, pageSize));
    }

    @GetMapping("/list")
    @SaCheckPermission("oa:contract:list")
    public R<List<OaContractPaymentSchedule>> listByContract(@RequestParam Long contractId) {
        return R.ok(oaContractMilestoneService.listPaymentsByContract(contractId));
    }

    @SysLog("新增合同付款节点")
    // M0-8: 防重复提交
    @RepeatSubmit
    @PostMapping
    @SaCheckPermission("oa:contract:edit")
    public R<Void> add(@RequestBody OaContractPaymentSchedule schedule) {
        try {
            return oaContractMilestoneService.savePayment(schedule) ? R.ok() : R.fail("新增失败");
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("修改合同付款节点")
    @PutMapping
    @SaCheckPermission("oa:contract:edit")
    public R<Void> edit(@RequestBody OaContractPaymentSchedule schedule) {
        return oaContractMilestoneService.updatePayment(schedule) ? R.ok() : R.fail("更新失败");
    }

    @SysLog("删除合同付款节点")
    @DeleteMapping("/{id}")
    @SaCheckPermission("oa:contract:edit")
    public R<Void> remove(@PathVariable Long id) {
        return oaContractMilestoneService.removePayment(id) ? R.ok() : R.fail("删除失败");
    }

    @SysLog("标记付款节点已付")
    // M0-8: 防重复提交
    @RepeatSubmit
    @PostMapping("/{id}/pay")
    @SaCheckPermission("oa:contract:edit")
    public R<Void> pay(@PathVariable Long id,
                       @RequestParam(required = false) BigDecimal actualAmount,
                       @RequestParam(required = false) String remark) {
        return oaContractMilestoneService.payPayment(id, actualAmount, remark) ? R.ok() : R.fail("操作失败");
    }
}

/**
 * OA-P1-2 会议纪要 + 出席记录 REST 端点。
 */
@RestController
@RequestMapping("/meeting/minutes")
@RequiredArgsConstructor
class OaMeetingMinutesController {

    private final IOaMeetingMinutesService oaMeetingMinutesService;

    @GetMapping("/page")
    @SaCheckPermission("oa:meeting:list")
    public R<Page<OaMeetingMinutes>> page(@RequestParam(required = false) String keyword,
                                          @RequestParam(required = false) String status,
                                          @RequestParam(required = false) Long meetingId,
                                          @RequestParam(defaultValue = "1") Integer pageNum,
                                          @RequestParam(defaultValue = "10") Integer pageSize) {
        return R.ok(oaMeetingMinutesService.page(keyword, status, meetingId, pageNum, pageSize));
    }

    @GetMapping("/{id}")
    @SaCheckPermission("oa:meeting:list")
    public R<OaMeetingMinutes> detail(@PathVariable Long id) {
        return R.ok(oaMeetingMinutesService.getDetail(id));
    }

    @SysLog("新增会议纪要")
    // M0-8: 防重复提交
    @RepeatSubmit
    @PostMapping
    @SaCheckPermission("oa:meeting:edit")
    public R<Void> add(@RequestBody OaMeetingMinutes minutes) {
        return oaMeetingMinutesService.save(minutes) ? R.ok() : R.fail("新增失败");
    }

    @SysLog("修改会议纪要")
    @PutMapping
    @SaCheckPermission("oa:meeting:edit")
    public R<Void> edit(@RequestBody OaMeetingMinutes minutes) {
        return oaMeetingMinutesService.update(minutes) ? R.ok() : R.fail("更新失败");
    }

    @SysLog("删除会议纪要")
    @DeleteMapping("/{id}")
    @SaCheckPermission("oa:meeting:edit")
    public R<Void> remove(@PathVariable Long id) {
        return oaMeetingMinutesService.remove(id) ? R.ok() : R.fail("删除失败");
    }

    @SysLog("确认会议纪要")
    // M0-8: 防重复提交
    @RepeatSubmit
    @PostMapping("/{id}/confirm")
    @SaCheckPermission("oa:meeting:edit")
    public R<Void> confirm(@PathVariable Long id) {
        return oaMeetingMinutesService.confirm(id) ? R.ok() : R.fail("操作失败");
    }

    @GetMapping("/{id}/attendance")
    @SaCheckPermission("oa:meeting:list")
    public R<List<OaMeetingAttendance>> listAttendance(@PathVariable Long id) {
        return R.ok(oaMeetingMinutesService.listAttendance(id));
    }

    @SysLog("登记会议出席")
    @PostMapping("/attendance")
    @SaCheckPermission("oa:meeting:edit")
    public R<Void> upsertAttendance(@RequestBody OaMeetingAttendance attendance) {
        return oaMeetingMinutesService.upsertAttendance(attendance) ? R.ok() : R.fail("操作失败");
    }

    @SysLog("删除会议出席")
    @DeleteMapping("/attendance/{id}")
    @SaCheckPermission("oa:meeting:edit")
    public R<Void> removeAttendance(@PathVariable Long id) {
        return oaMeetingMinutesService.removeAttendance(id) ? R.ok() : R.fail("删除失败");
    }

    @SysLog("会议决议项一键派发为工作任务")
    // M0-8: 防重复提交
    @RepeatSubmit
    @PostMapping("/{id}/dispatch-decisions")
    @SaCheckPermission("oa:meeting:edit")
    public R<List<Long>> dispatch(@PathVariable Long id,
                                  @RequestBody(required = false) List<Map<String, Object>> decisions) {
        return R.ok(oaMeetingMinutesService.dispatchDecisionsToWorkTasks(id, decisions));
    }
}

/**
 * OA-P1-3 知识库文档模板 REST 端点。
 */
@RestController
@RequestMapping("/knowledge/template")
@RequiredArgsConstructor
class OaKnowledgeTemplateController {

    private final IOaKnowledgeTemplateService oaKnowledgeTemplateService;

    @GetMapping("/page")
    @SaCheckPermission("oa:knowledge:list")
    public R<Page<OaKnowledgeTemplate>> page(@RequestParam(required = false) String keyword,
                                             @RequestParam(required = false) String category,
                                             @RequestParam(required = false) String status,
                                             @RequestParam(defaultValue = "1") Integer pageNum,
                                             @RequestParam(defaultValue = "10") Integer pageSize) {
        return R.ok(oaKnowledgeTemplateService.page(keyword, category, status, pageNum, pageSize));
    }

    @GetMapping("/active")
    @SaCheckPermission("oa:knowledge:list")
    public R<List<OaKnowledgeTemplate>> listActive(@RequestParam(required = false) String category) {
        return R.ok(oaKnowledgeTemplateService.listActive(category));
    }

    @GetMapping("/{id}")
    @SaCheckPermission("oa:knowledge:list")
    public R<OaKnowledgeTemplate> detail(@PathVariable Long id) {
        return R.ok(oaKnowledgeTemplateService.getById(id));
    }

    @SysLog("新增知识库模板")
    // M0-8: 防重复提交
    @RepeatSubmit
    @PostMapping
    @SaCheckPermission("oa:knowledge:add")
    public R<Void> add(@RequestBody OaKnowledgeTemplate template) {
        try {
            return oaKnowledgeTemplateService.save(template) ? R.ok() : R.fail("新增失败");
        } catch (IllegalArgumentException e) {
            return R.fail(e.getMessage());
        }
    }

    @SysLog("修改知识库模板")
    @PutMapping
    @SaCheckPermission("oa:knowledge:edit")
    public R<Void> edit(@RequestBody OaKnowledgeTemplate template) {
        return oaKnowledgeTemplateService.update(template) ? R.ok() : R.fail("更新失败");
    }

    @SysLog("删除知识库模板")
    @DeleteMapping("/{id}")
    @SaCheckPermission("oa:knowledge:remove")
    public R<Void> remove(@PathVariable Long id) {
        return oaKnowledgeTemplateService.remove(id) ? R.ok() : R.fail("删除失败");
    }

    @SysLog("使用知识库模板(累加使用次数)")
    @RepeatSubmit
    @PostMapping("/{id}/use")
    @SaCheckPermission("oa:knowledge:add")
    public R<String> use(@PathVariable Long id) {
        return R.ok(oaKnowledgeTemplateService.useTemplate(id));
    }
}
