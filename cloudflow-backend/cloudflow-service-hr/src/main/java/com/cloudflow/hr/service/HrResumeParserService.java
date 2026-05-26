package com.cloudflow.hr.service;

import com.cloudflow.hr.domain.dto.HrResumeParsedFieldsPayload;
import com.cloudflow.hr.domain.vo.recruitment.HrResumeParsedFieldVO;

import java.util.List;

/**
 * HR-P1-1 简历解析服务。
 *
 * <p>实现采用基于正则的字段抽取（不引入 Apache Tika 依赖以减少启动期类路径风险）；
 * 解析结果落到 hr_resume_parsed_fields，并将关键字段回填 hr_candidate（仅在 HR 复核确认后）。
 */
public interface HrResumeParserService {

    /** 触发简历解析（同事务内同步执行；附件 URL 应已落 sys_file）。 */
    Long parseResume(Long candidateId, String resumeUrl, String rawText);

    /** 列出某候选人的解析结果。 */
    List<HrResumeParsedFieldVO> listParsed(Long candidateId);

    /** HR 复核确认 → 回填到 hr_candidate。 */
    void confirmParsed(Long parsedId);

    /** HR 复核驳回 → 不回填，仅标记。 */
    void rejectParsed(Long parsedId, String reason);

    /** 手动保存/编辑解析字段（HR 可手动修正抽取错误）。 */
    void updateParsed(Long parsedId, HrResumeParsedFieldsPayload payload);
}
