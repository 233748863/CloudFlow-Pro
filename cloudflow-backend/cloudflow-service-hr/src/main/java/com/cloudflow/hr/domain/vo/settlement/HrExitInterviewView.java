package com.cloudflow.hr.domain.vo.settlement;

import com.fasterxml.jackson.annotation.JsonFormat;
import java.time.LocalDateTime;
import java.util.List;

public record HrExitInterviewView(Long interviewId, Long employeeId, String employeeName, Long lifecycleApplicationId, String applicationNo,
        Long settlementId, Long interviewerId, String interviewerName,
        @JsonFormat(pattern = "yyyy-MM-dd'T'HH:mm:ss") LocalDateTime interviewTime,
        String location, String leavingReason, String employeeFeedback, String managerComment,
        List<String> improvementItems, List<Long> attachmentFileIds, List<Option> attachmentFiles, String status, Integer version) {
    public record Attachment(Long fileId, String fileName, long fileSize, Integer version) { }
    public record Option(Long value, String label) { }
}
