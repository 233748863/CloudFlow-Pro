package com.cloudflow.hr.domain.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import com.cloudflow.hr.domain.dto.HrExamPaperPayload;

@TableName(value = "hr_exam_paper", autoResultMap = true)
public class HrExamPaper extends HrExamPaperPayload {
}
