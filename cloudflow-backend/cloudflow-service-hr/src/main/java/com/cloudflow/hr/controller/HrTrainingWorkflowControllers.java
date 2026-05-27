package com.cloudflow.hr.controller;

import cn.dev33.satoken.annotation.SaCheckPermission;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.core.web.MapConverters;
import com.cloudflow.common.log.annotation.SysLog;
import com.cloudflow.hr.domain.dto.HrExamPaperPayload;
import com.cloudflow.hr.domain.dto.HrExamQuestionBankPayload;
import com.cloudflow.hr.domain.dto.training.HrExamAnswerDTO;
import com.cloudflow.hr.domain.dto.training.HrExamAttemptGradeDTO;
import com.cloudflow.hr.domain.dto.training.HrExamAttemptStartDTO;
import com.cloudflow.hr.domain.dto.training.HrExamAttemptSubmitDTO;
import com.cloudflow.hr.domain.dto.training.HrTrainingCommonQueryDTO;
import com.cloudflow.hr.domain.dto.training.HrTrainingEnrollDTO;
import com.cloudflow.hr.domain.dto.training.HrTrainingEnrollmentCompleteDTO;
import com.cloudflow.hr.domain.entity.HrExamAttempt;
import com.cloudflow.hr.domain.entity.HrExamPaper;
import com.cloudflow.hr.domain.entity.HrExamQuestionBank;
import com.cloudflow.hr.domain.entity.HrTrainingEnrollment;
import com.cloudflow.hr.domain.vo.training.HrExamAttemptStartVO;
import com.cloudflow.hr.domain.vo.training.HrExamAttemptSubmitVO;
import com.cloudflow.hr.domain.vo.training.HrExamAttemptVO;
import com.cloudflow.hr.domain.vo.training.HrExamPaperVO;
import com.cloudflow.hr.domain.vo.training.HrExamQuestionBankVO;
import com.cloudflow.hr.domain.vo.training.HrTrainingEnrollmentVO;
import com.cloudflow.hr.service.HrEssSupport;
import com.cloudflow.hr.service.IHrExamService;
import com.cloudflow.hr.service.IHrTrainingEnrollmentService;
import com.cloudflow.hr.service.HrTypedCrudService;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

/**
 * 培训业务流控制器：报名 / 题库 / 试卷 / 作答 / 批改。
 *
 * <p>区别于 {@link HrTrainingResourceControllers}（基础资源 CRUD）：本文件落业务动作类端点，
 * 报名走 workflow startProcess + APPROVED 回调 enrolled_count++，考试走自动判分 + 主观题人工批改。
 */
@RestController
@RequestMapping("/training/enrollments")
@RequiredArgsConstructor
class HrTrainingEnrollmentController {

    private final IHrTrainingEnrollmentService hrTrainingEnrollmentService;
    private final HrTypedCrudService crudService;
    private final HrEssSupport essSupport;
    private final ObjectMapper objectMapper;

    @GetMapping
    @SaCheckPermission("hr:training:enroll:list")
    public R<PageResult<HrTrainingEnrollmentVO>> list(@Validated @ModelAttribute HrTrainingCommonQueryDTO query) {
        return R.ok(MapConverters.toPageResult(
                crudService.page(HrTrainingEnrollment.class, MapConverters.toServiceQuery(query, objectMapper)),
                HrTrainingEnrollmentVO.class, objectMapper));
    }

    @GetMapping("/mine")
    @SaCheckPermission("hr:training:enroll:list")
    public R<PageResult<HrTrainingEnrollmentVO>> mine(@Validated @ModelAttribute HrTrainingCommonQueryDTO query) {
        Map<String, Object> normalized = MapConverters.toServiceQuery(query, objectMapper);
        normalized.put("employeeId", essSupport.currentEmployeeId());
        return R.ok(MapConverters.toPageResult(
                crudService.page(HrTrainingEnrollment.class, normalized),
                HrTrainingEnrollmentVO.class, objectMapper));
    }

    @SysLog("发起HR培训报名")
    @PostMapping
    @SaCheckPermission("hr:training:enroll:add")
    public R<Long> enroll(@Validated @RequestBody HrTrainingEnrollDTO dto) {
        return R.ok(hrTrainingEnrollmentService.enroll(dto.getSessionId(), dto.getEnrollType(), dto.getComment()));
    }

    @SysLog("HR培训签到")
    @PostMapping("/{id}/check-in")
    @SaCheckPermission("hr:training:enroll:edit")
    public R<Void> checkIn(@PathVariable Long id) {
        hrTrainingEnrollmentService.checkIn(id);
        return R.ok();
    }

    @SysLog("HR培训结业登记")
    @PostMapping("/{id}/complete")
    @SaCheckPermission("hr:training:enroll:edit")
    public R<Void> complete(@PathVariable Long id, @Validated @RequestBody HrTrainingEnrollmentCompleteDTO dto) {
        hrTrainingEnrollmentService.complete(id, dto.getCompletionStatus(), dto.getScore(), dto.getComment());
        return R.ok();
    }

    @SysLog("撤销HR培训报名")
    @PostMapping("/{id}/cancel")
    @SaCheckPermission("hr:training:enroll:edit")
    public R<Void> cancel(@PathVariable Long id) {
        hrTrainingEnrollmentService.cancel(id);
        return R.ok();
    }
}

@RestController
@RequestMapping("/training/questions")
@RequiredArgsConstructor
class HrExamQuestionBankController {

    private final HrTypedCrudService crudService;
    private final ObjectMapper objectMapper;

    @GetMapping
    @SaCheckPermission("hr:training:exam:list")
    public R<PageResult<HrExamQuestionBankVO>> list(@Validated @ModelAttribute HrTrainingCommonQueryDTO query) {
        return R.ok(MapConverters.toPageResult(
                crudService.page(HrExamQuestionBank.class, MapConverters.toServiceQuery(query, objectMapper)),
                HrExamQuestionBankVO.class, objectMapper));
    }

    @GetMapping("/{id}")
    @SaCheckPermission("hr:training:exam:list")
    public R<HrExamQuestionBankVO> get(@PathVariable Long id) {
        return R.ok(MapConverters.toVO(crudService.get(HrExamQuestionBank.class, id),
                HrExamQuestionBankVO.class, objectMapper));
    }

    @SysLog("新增HR考试题目")
    @PostMapping
    @SaCheckPermission("hr:training:exam:add")
    public R<Long> create(@RequestBody HrExamQuestionBankPayload payload) {
        return R.ok(crudService.create(HrExamQuestionBank.class, payload));
    }

    @SysLog("修改HR考试题目")
    @PutMapping("/{id}")
    @SaCheckPermission("hr:training:exam:edit")
    public R<Void> update(@PathVariable Long id, @RequestBody HrExamQuestionBankPayload payload) {
        crudService.update(HrExamQuestionBank.class, id, payload);
        return R.ok();
    }

    @SysLog("删除HR考试题目")
    @DeleteMapping("/{id}")
    @SaCheckPermission("hr:training:exam:remove")
    public R<Void> delete(@PathVariable Long id) {
        crudService.delete(HrExamQuestionBank.class, id);
        return R.ok();
    }
}

@RestController
@RequestMapping("/training/papers")
@RequiredArgsConstructor
class HrExamPaperController {

    private final IHrExamService hrExamService;
    private final HrTypedCrudService crudService;
    private final ObjectMapper objectMapper;

    @GetMapping
    @SaCheckPermission("hr:training:exam:list")
    public R<PageResult<HrExamPaperVO>> list(@Validated @ModelAttribute HrTrainingCommonQueryDTO query) {
        return R.ok(MapConverters.toPageResult(
                crudService.page(HrExamPaper.class, MapConverters.toServiceQuery(query, objectMapper)),
                HrExamPaperVO.class, objectMapper));
    }

    @GetMapping("/{id}")
    @SaCheckPermission("hr:training:exam:list")
    public R<HrExamPaperVO> get(@PathVariable Long id) {
        return R.ok(MapConverters.toVO(crudService.get(HrExamPaper.class, id),
                HrExamPaperVO.class, objectMapper));
    }

    @SysLog("保存HR考试试卷")
    @PostMapping
    @SaCheckPermission("hr:training:exam:add")
    public R<Long> save(@RequestBody HrExamPaperPayload payload) {
        return R.ok(hrExamService.savePaper(payload));
    }

    @SysLog("修改HR考试试卷")
    @PutMapping("/{id}")
    @SaCheckPermission("hr:training:exam:edit")
    public R<Long> update(@PathVariable Long id, @RequestBody HrExamPaperPayload payload) {
        payload.setId(id);
        return R.ok(hrExamService.savePaper(payload));
    }

    @SysLog("删除HR考试试卷")
    @DeleteMapping("/{id}")
    @SaCheckPermission("hr:training:exam:remove")
    public R<Void> delete(@PathVariable Long id) {
        crudService.delete(HrExamPaper.class, id);
        return R.ok();
    }

    @SysLog("HR考试开始作答")
    @PostMapping("/{id}/attempts")
    @SaCheckPermission("hr:training:exam:attempt")
    public R<HrExamAttemptStartVO> startAttempt(@PathVariable Long id,
                                                @RequestBody(required = false) HrExamAttemptStartDTO dto) {
        Long sessionId = dto == null ? null : dto.getSessionId();
        Long attemptId = hrExamService.startAttempt(id, sessionId);
        return R.ok(new HrExamAttemptStartVO(attemptId));
    }
}

@RestController
@RequestMapping("/training/attempts")
@RequiredArgsConstructor
class HrExamAttemptController {

    private final IHrExamService hrExamService;
    private final HrTypedCrudService crudService;
    private final HrEssSupport essSupport;
    private final ObjectMapper objectMapper;

    @GetMapping
    @SaCheckPermission("hr:training:exam:list")
    public R<PageResult<HrExamAttemptVO>> list(@Validated @ModelAttribute HrTrainingCommonQueryDTO query) {
        return R.ok(MapConverters.toPageResult(
                crudService.page(HrExamAttempt.class, MapConverters.toServiceQuery(query, objectMapper)),
                HrExamAttemptVO.class, objectMapper));
    }

    @GetMapping("/mine")
    @SaCheckPermission("hr:training:exam:attempt")
    public R<PageResult<HrExamAttemptVO>> mine(@Validated @ModelAttribute HrTrainingCommonQueryDTO query) {
        Map<String, Object> normalized = MapConverters.toServiceQuery(query, objectMapper);
        normalized.put("employeeId", essSupport.currentEmployeeId());
        return R.ok(MapConverters.toPageResult(
                crudService.page(HrExamAttempt.class, normalized),
                HrExamAttemptVO.class, objectMapper));
    }

    @GetMapping("/{id}")
    @SaCheckPermission("hr:training:exam:list")
    public R<HrExamAttemptVO> get(@PathVariable Long id) {
        return R.ok(MapConverters.toVO(crudService.get(HrExamAttempt.class, id),
                HrExamAttemptVO.class, objectMapper));
    }

    @SysLog("HR考试提交答卷")
    @PostMapping("/{id}/submit")
    @SaCheckPermission("hr:training:exam:attempt")
    public R<HrExamAttemptSubmitVO> submit(@PathVariable Long id,
                                            @Validated @RequestBody(required = false) HrExamAttemptSubmitDTO dto) {
        List<HrExamAnswerDTO> answers = (dto == null || dto.getAnswers() == null)
                ? List.of() : dto.getAnswers();
        return R.ok(hrExamService.submit(id, answers));
    }

    @SysLog("HR考试主观题批改")
    @PostMapping("/{id}/grade")
    @SaCheckPermission("hr:training:exam:grade")
    public R<Void> grade(@PathVariable Long id, @Validated @RequestBody HrExamAttemptGradeDTO dto) {
        hrExamService.grade(id, dto.getScore(), dto.getPassFlag(), dto.getComment());
        return R.ok();
    }
}
