package com.cloudflow.hr.domain.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import com.cloudflow.hr.domain.dto.HrExamQuestionBankPayload;

@TableName(value = "hr_exam_question_bank", autoResultMap = true)
public class HrExamQuestionBank extends HrExamQuestionBankPayload {
}
