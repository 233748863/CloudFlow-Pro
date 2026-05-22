package com.cloudflow.hr.controller;

import cn.dev33.satoken.annotation.SaCheckPermission;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.log.annotation.SysLog;
import com.cloudflow.hr.domain.dto.HrExamPaperPayload;
import com.cloudflow.hr.domain.dto.HrExamQuestionBankPayload;
import com.cloudflow.hr.domain.entity.HrExamAttempt;
import com.cloudflow.hr.domain.entity.HrExamPaper;
import com.cloudflow.hr.domain.entity.HrExamQuestionBank;
import com.cloudflow.hr.domain.entity.HrTrainingEnrollment;
import com.cloudflow.hr.service.HrEssSupport;
import com.cloudflow.hr.service.HrExamService;
import com.cloudflow.hr.service.HrTrainingEnrollmentService;
import com.cloudflow.hr.service.HrTypedCrudService;
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
import java.util.HashMap;
import java.util.LinkedHashMap;
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

    private final HrTrainingEnrollmentService enrollmentService;
    private final HrTypedCrudService crudService;
    private final HrEssSupport essSupport;

    @GetMapping
    @SaCheckPermission("hr:training:enroll:list")
    public R<?> list(@RequestParam Map<String, Object> query) {
        return R.ok(crudService.page(HrTrainingEnrollment.class, query));
    }

    @GetMapping("/mine")
    @SaCheckPermission("hr:training:enroll:list")
    public R<?> mine(@RequestParam Map<String, Object> query) {
        Map<String, Object> normalized = new HashMap<>(query);
        normalized.put("employeeId", essSupport.currentEmployeeId());
        return R.ok(crudService.page(HrTrainingEnrollment.class, normalized));
    }

    @SysLog("发起HR培训报名")
    @PostMapping
    @SaCheckPermission("hr:training:enroll:add")
    public R<Long> enroll(@RequestBody Map<String, Object> body) {
        Long sessionId = toLong(body.get("sessionId"));
        String enrollType = body.get("enrollType") == null ? null : String.valueOf(body.get("enrollType"));
        String comment = body.get("comment") == null ? null : String.valueOf(body.get("comment"));
        return R.ok(enrollmentService.enroll(sessionId, enrollType, comment));
    }

    @SysLog("HR培训签到")
    @PostMapping("/{id}/check-in")
    @SaCheckPermission("hr:training:enroll:edit")
    public R<Void> checkIn(@PathVariable Long id) {
        enrollmentService.checkIn(id);
        return R.ok();
    }

    @SysLog("HR培训结业登记")
    @PostMapping("/{id}/complete")
    @SaCheckPermission("hr:training:enroll:edit")
    public R<Void> complete(@PathVariable Long id, @RequestBody Map<String, Object> body) {
        String completionStatus = body.get("completionStatus") == null ? null : String.valueOf(body.get("completionStatus"));
        BigDecimal score = toBigDecimal(body.get("score"));
        String comment = body.get("comment") == null ? null : String.valueOf(body.get("comment"));
        enrollmentService.complete(id, completionStatus, score, comment);
        return R.ok();
    }

    @SysLog("撤销HR培训报名")
    @PostMapping("/{id}/cancel")
    @SaCheckPermission("hr:training:enroll:edit")
    public R<Void> cancel(@PathVariable Long id) {
        enrollmentService.cancel(id);
        return R.ok();
    }

    private Long toLong(Object value) {
        if (value == null) {
            return null;
        }
        if (value instanceof Number num) {
            return num.longValue();
        }
        try {
            return Long.parseLong(String.valueOf(value));
        } catch (NumberFormatException ex) {
            return null;
        }
    }

    private BigDecimal toBigDecimal(Object value) {
        if (value == null) {
            return null;
        }
        if (value instanceof BigDecimal bd) {
            return bd;
        }
        if (value instanceof Number num) {
            return BigDecimal.valueOf(num.doubleValue());
        }
        try {
            return new BigDecimal(String.valueOf(value));
        } catch (NumberFormatException ex) {
            return null;
        }
    }
}

@RestController
@RequestMapping("/training/questions")
@RequiredArgsConstructor
class HrExamQuestionBankController {

    private final HrTypedCrudService crudService;

    @GetMapping
    @SaCheckPermission("hr:training:exam:list")
    public R<?> list(@RequestParam Map<String, Object> query) {
        return R.ok(crudService.page(HrExamQuestionBank.class, query));
    }

    @GetMapping("/{id}")
    @SaCheckPermission("hr:training:exam:list")
    public R<Map<String, Object>> get(@PathVariable Long id) {
        return R.ok(crudService.get(HrExamQuestionBank.class, id));
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

    private final HrExamService examService;
    private final HrTypedCrudService crudService;

    @GetMapping
    @SaCheckPermission("hr:training:exam:list")
    public R<?> list(@RequestParam Map<String, Object> query) {
        return R.ok(crudService.page(HrExamPaper.class, query));
    }

    @GetMapping("/{id}")
    @SaCheckPermission("hr:training:exam:list")
    public R<Map<String, Object>> get(@PathVariable Long id) {
        return R.ok(crudService.get(HrExamPaper.class, id));
    }

    @SysLog("保存HR考试试卷")
    @PostMapping
    @SaCheckPermission("hr:training:exam:add")
    public R<Long> save(@RequestBody HrExamPaperPayload payload) {
        return R.ok(examService.savePaper(payload));
    }

    @SysLog("修改HR考试试卷")
    @PutMapping("/{id}")
    @SaCheckPermission("hr:training:exam:edit")
    public R<Long> update(@PathVariable Long id, @RequestBody HrExamPaperPayload payload) {
        payload.setId(id);
        return R.ok(examService.savePaper(payload));
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
    public R<Map<String, Object>> startAttempt(@PathVariable Long id,
                                                @RequestBody(required = false) Map<String, Object> body) {
        Long sessionId = body == null ? null : toLong(body.get("sessionId"));
        Long attemptId = examService.startAttempt(id, sessionId);
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("attemptId", attemptId);
        return R.ok(data);
    }

    private Long toLong(Object value) {
        if (value == null) {
            return null;
        }
        if (value instanceof Number num) {
            return num.longValue();
        }
        try {
            return Long.parseLong(String.valueOf(value));
        } catch (NumberFormatException ex) {
            return null;
        }
    }
}

@RestController
@RequestMapping("/training/attempts")
@RequiredArgsConstructor
class HrExamAttemptController {

    private final HrExamService examService;
    private final HrTypedCrudService crudService;
    private final HrEssSupport essSupport;

    @GetMapping
    @SaCheckPermission("hr:training:exam:list")
    public R<?> list(@RequestParam Map<String, Object> query) {
        return R.ok(crudService.page(HrExamAttempt.class, query));
    }

    @GetMapping("/mine")
    @SaCheckPermission("hr:training:exam:attempt")
    public R<?> mine(@RequestParam Map<String, Object> query) {
        Map<String, Object> normalized = new HashMap<>(query);
        normalized.put("employeeId", essSupport.currentEmployeeId());
        return R.ok(crudService.page(HrExamAttempt.class, normalized));
    }

    @GetMapping("/{id}")
    @SaCheckPermission("hr:training:exam:list")
    public R<Map<String, Object>> get(@PathVariable Long id) {
        return R.ok(crudService.get(HrExamAttempt.class, id));
    }

    @SysLog("HR考试提交答卷")
    @PostMapping("/{id}/submit")
    @SaCheckPermission("hr:training:exam:attempt")
    public R<Map<String, Object>> submit(@PathVariable Long id,
                                          @RequestBody(required = false) Map<String, Object> body) {
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> answers = body == null
                ? List.of()
                : (List<Map<String, Object>>) body.getOrDefault("answers", List.of());
        return R.ok(examService.submit(id, answers));
    }

    @SysLog("HR考试主观题批改")
    @PostMapping("/{id}/grade")
    @SaCheckPermission("hr:training:exam:grade")
    public R<Void> grade(@PathVariable Long id, @RequestBody Map<String, Object> body) {
        BigDecimal score = toBigDecimal(body.get("score"));
        Boolean passFlag = toBoolean(body.get("passFlag"));
        String comment = body.get("comment") == null ? null : String.valueOf(body.get("comment"));
        examService.grade(id, score, passFlag, comment);
        return R.ok();
    }

    private BigDecimal toBigDecimal(Object value) {
        if (value == null) {
            return null;
        }
        if (value instanceof BigDecimal bd) {
            return bd;
        }
        if (value instanceof Number num) {
            return BigDecimal.valueOf(num.doubleValue());
        }
        try {
            return new BigDecimal(String.valueOf(value));
        } catch (NumberFormatException ex) {
            return null;
        }
    }

    private Boolean toBoolean(Object value) {
        if (value == null) {
            return null;
        }
        if (value instanceof Boolean b) {
            return b;
        }
        String s = String.valueOf(value).trim().toLowerCase();
        return switch (s) {
            case "true", "1", "yes", "y" -> Boolean.TRUE;
            case "false", "0", "no", "n" -> Boolean.FALSE;
            default -> null;
        };
    }
}
