package com.cloudflow.hr.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.UpdateWrapper;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.tenant.TenantContext;
import com.cloudflow.hr.domain.dto.HrExamPaperPayload;
import com.cloudflow.hr.domain.entity.HrExamAttempt;
import com.cloudflow.hr.domain.entity.HrExamPaper;
import com.cloudflow.hr.domain.entity.HrExamQuestionBank;
import com.cloudflow.hr.exception.HrBusinessException;
import com.cloudflow.hr.mapper.HrExamAttemptMapper;
import com.cloudflow.hr.mapper.HrExamPaperMapper;
import com.cloudflow.hr.mapper.HrExamQuestionBankMapper;
import com.cloudflow.hr.service.HrEssSupport;
import com.cloudflow.hr.service.HrExamService;
import com.cloudflow.hr.service.HrTypedCrudService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;

@Slf4j
@Service
@RequiredArgsConstructor
public class HrExamServiceImpl implements HrExamService {

    private final HrExamPaperMapper paperMapper;
    private final HrExamQuestionBankMapper questionBankMapper;
    private final HrExamAttemptMapper attemptMapper;
    private final HrEssSupport essSupport;
    private final HrTypedCrudService crudService;

    @Override
    @Transactional(rollbackFor = Exception.class)
    public Long savePaper(HrExamPaperPayload payload) {
        if (payload == null || !StringUtils.hasText(payload.getPaperName())) {
            throw new HrBusinessException("INVALID_PARAMETER", "试卷名称不能为空");
        }
        if ("RANDOM".equalsIgnoreCase(payload.getGenerateMode())) {
            List<Long> picked = pickRandomQuestionIds(payload);
            payload.setQuestionIds(picked);
            payload.setQuestionCount(picked.size());
        } else if (payload.getQuestionIds() != null) {
            payload.setQuestionCount(payload.getQuestionIds().size());
        }
        if (!StringUtils.hasText(payload.getStatus())) {
            payload.setStatus("PUBLISHED");
        }
        if (payload.getId() == null) {
            return crudService.create(HrExamPaper.class, payload);
        }
        crudService.update(HrExamPaper.class, payload.getId(), payload);
        return payload.getId();
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public Long startAttempt(Long paperId, Long sessionId) {
        if (paperId == null) {
            throw new HrBusinessException("INVALID_PARAMETER", "paperId 不能为空");
        }
        HrExamPaper paper = paperMapper.selectById(paperId);
        if (paper == null || !"PUBLISHED".equalsIgnoreCase(paper.getStatus())) {
            throw new HrBusinessException("PAPER_NOT_AVAILABLE", "试卷不可用：" + paperId);
        }
        Long employeeId = essSupport.currentEmployeeId();
        Long tenantId = currentTenantId();

        HrExamAttempt attempt = new HrExamAttempt();
        attempt.setTenantId(tenantId);
        attempt.setPaperId(paperId);
        attempt.setEmployeeId(employeeId);
        attempt.setSessionId(sessionId);
        attempt.setStartTime(LocalDateTime.now());
        attempt.setStatus("IN_PROGRESS");
        attempt.setAnswers(new ArrayList<>());
        attemptMapper.insert(attempt);
        return attempt.getId();
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> submit(Long attemptId, List<Map<String, Object>> answers) {
        HrExamAttempt attempt = loadAttempt(attemptId);
        essSupport.assertOwner(attempt.getEmployeeId());
        if (!"IN_PROGRESS".equalsIgnoreCase(attempt.getStatus())) {
            throw new HrBusinessException("ATTEMPT_NOT_OPEN",
                    "当前作答状态 " + attempt.getStatus() + " 不允许提交");
        }
        HrExamPaper paper = paperMapper.selectById(attempt.getPaperId());
        if (paper == null) {
            throw new HrBusinessException("PAPER_NOT_FOUND", "试卷不存在：" + attempt.getPaperId());
        }
        List<Map<String, Object>> finalAnswers = answers == null ? List.of() : answers;
        GradeResult result = autoGrade(paper, finalAnswers);

        String finalStatus = result.hasSubjective() ? "SUBMITTED" : "GRADED";
        Boolean passFlag = !result.hasSubjective() && paper.getPassScore() != null
                ? result.totalScore().compareTo(paper.getPassScore()) >= 0
                : null;

        UpdateWrapper<HrExamAttempt> wrapper = new UpdateWrapper<>();
        wrapper.eq("id", attemptId)
                .eq("tenant_id", currentTenantId())
                .set("submit_time", LocalDateTime.now())
                .set("score", result.totalScore())
                .set("pass_flag", passFlag)
                .set("status", finalStatus)
                .set("update_time", LocalDateTime.now());
        attempt.setAnswers(result.gradedAnswers());
        attemptMapper.update(attempt, wrapper);

        Map<String, Object> response = new LinkedHashMap<>();
        response.put("attemptId", attemptId);
        response.put("status", finalStatus);
        response.put("score", result.totalScore());
        response.put("passFlag", passFlag);
        response.put("hasSubjective", result.hasSubjective());
        return response;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void grade(Long attemptId, BigDecimal score, Boolean passFlag, String comment) {
        HrExamAttempt attempt = loadAttempt(attemptId);
        if ("GRADED".equalsIgnoreCase(attempt.getStatus())) {
            return;
        }
        UpdateWrapper<HrExamAttempt> wrapper = new UpdateWrapper<>();
        wrapper.eq("id", attemptId)
                .eq("tenant_id", currentTenantId())
                .set("score", score)
                .set("pass_flag", passFlag)
                .set("status", "GRADED")
                .set("update_time", LocalDateTime.now());
        attemptMapper.update(null, wrapper);
        log.info("考试批改完成，attemptId: {}, score: {}, passFlag: {}", attemptId, score, passFlag);
    }

    private List<Long> pickRandomQuestionIds(HrExamPaperPayload payload) {
        Map<String, Object> config = payload.getConfig() == null ? Map.of() : payload.getConfig();
        Integer requestedCount = toInteger(config.get("count"));
        Long categoryId = toLong(config.get("categoryId"));
        QueryWrapper<HrExamQuestionBank> wrapper = new QueryWrapper<>();
        wrapper.eq("tenant_id", currentTenantId()).eq("deleted", 0).eq("status", "ACTIVE");
        if (categoryId != null) {
            wrapper.eq("category_id", categoryId);
        }
        List<HrExamQuestionBank> all = questionBankMapper.selectList(wrapper);
        Collections.shuffle(all);
        int limit = requestedCount == null ? Math.min(all.size(), 20) : Math.min(requestedCount, all.size());
        List<Long> ids = new ArrayList<>(limit);
        for (int i = 0; i < limit; i++) {
            ids.add(all.get(i).getId());
        }
        return ids;
    }

    private GradeResult autoGrade(HrExamPaper paper, List<Map<String, Object>> answers) {
        List<Long> questionIds = paper.getQuestionIds() == null ? List.of() : paper.getQuestionIds();
        Map<Long, HrExamQuestionBank> bank = loadQuestions(questionIds);
        BigDecimal total = BigDecimal.ZERO;
        boolean hasSubjective = false;
        List<Map<String, Object>> graded = new ArrayList<>(answers.size());
        for (Map<String, Object> ans : answers) {
            Long qid = toLong(ans.get("questionId"));
            HrExamQuestionBank q = qid == null ? null : bank.get(qid);
            Map<String, Object> row = new LinkedHashMap<>(ans);
            row.putIfAbsent("questionId", qid);
            if (q == null) {
                row.put("autoGraded", false);
                graded.add(row);
                continue;
            }
            String type = String.valueOf(q.getQuestionType()).toUpperCase(Locale.ROOT);
            BigDecimal questionScore = q.getScore() == null ? BigDecimal.ZERO : q.getScore();
            if ("ESSAY".equals(type)) {
                hasSubjective = true;
                row.put("autoGraded", false);
                row.put("maxScore", questionScore);
                graded.add(row);
                continue;
            }
            boolean correct = compareAnswer(q.getAnswer(), ans.get("answer"));
            BigDecimal awarded = correct ? questionScore : BigDecimal.ZERO;
            row.put("autoGraded", true);
            row.put("correct", correct);
            row.put("score", awarded.setScale(2, RoundingMode.HALF_UP));
            total = total.add(awarded);
            graded.add(row);
        }
        return new GradeResult(total.setScale(2, RoundingMode.HALF_UP), hasSubjective, graded);
    }

    private boolean compareAnswer(List<Object> reference, Object submitted) {
        if (reference == null || reference.isEmpty() || submitted == null) {
            return false;
        }
        if (submitted instanceof List<?> list) {
            if (list.size() != reference.size()) {
                return false;
            }
            List<String> ref = reference.stream().map(this::normalize).sorted().toList();
            List<String> sub = list.stream().map(this::normalize).sorted().toList();
            return ref.equals(sub);
        }
        if (reference.size() == 1) {
            return Objects.equals(normalize(reference.get(0)), normalize(submitted));
        }
        return false;
    }

    private String normalize(Object value) {
        return value == null ? "" : String.valueOf(value).trim().toUpperCase(Locale.ROOT);
    }

    private Map<Long, HrExamQuestionBank> loadQuestions(List<Long> ids) {
        if (ids.isEmpty()) {
            return Map.of();
        }
        QueryWrapper<HrExamQuestionBank> wrapper = new QueryWrapper<>();
        wrapper.in("id", ids);
        Map<Long, HrExamQuestionBank> result = new HashMap<>(ids.size() * 2);
        for (HrExamQuestionBank q : questionBankMapper.selectList(wrapper)) {
            result.put(q.getId(), q);
        }
        return result;
    }

    private HrExamAttempt loadAttempt(Long id) {
        if (id == null) {
            throw new HrBusinessException("INVALID_PARAMETER", "attemptId 不能为空");
        }
        HrExamAttempt attempt = attemptMapper.selectById(id);
        if (attempt == null) {
            throw new HrBusinessException("ATTEMPT_NOT_FOUND", "考试作答记录不存在：" + id);
        }
        return attempt;
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

    private Integer toInteger(Object value) {
        if (value == null) {
            return null;
        }
        if (value instanceof Number num) {
            return num.intValue();
        }
        try {
            return Integer.parseInt(String.valueOf(value));
        } catch (NumberFormatException ex) {
            return null;
        }
    }

    private Long currentTenantId() {
        Long tid = TenantContext.getTenantId();
        if (tid != null) {
            return tid;
        }
        tid = UserContext.getTenantId();
        return tid == null ? 100000L : tid;
    }

    private record GradeResult(BigDecimal totalScore, boolean hasSubjective, List<Map<String, Object>> gradedAnswers) {
    }
}
