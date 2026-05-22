package com.cloudflow.hr.service;

import com.cloudflow.hr.domain.dto.HrExamPaperPayload;

import java.util.List;
import java.util.Map;

/**
 * 考试服务：组卷 + 答题 + 自动判分 + 主观题人工批改。
 *
 * <p>客观题（SINGLE / MULTI / JUDGE / FILL）由 {@link #submit} 自动判分；
 * 主观题（ESSAY）需要 HR 在 {@link #grade} 时手动给分。
 */
public interface HrExamService {

    /**
     * 创建/保存试卷。当 generateMode=RANDOM 时由 config 中的 strategy 自动从题库挑题。
     */
    Long savePaper(HrExamPaperPayload payload);

    /**
     * 员工开始作答。生成 hr_exam_attempt(status=IN_PROGRESS, start_time=NOW)。
     */
    Long startAttempt(Long paperId, Long sessionId);

    /**
     * 员工提交答案。对客观题做自动判分写 score，全卷无主观题时切到 GRADED 否则 SUBMITTED。
     */
    Map<String, Object> submit(Long attemptId, List<Map<String, Object>> answers);

    /**
     * HR 批改主观题：覆盖 score / passFlag，切 status=GRADED。
     */
    void grade(Long attemptId, java.math.BigDecimal score, Boolean passFlag, String comment);
}
