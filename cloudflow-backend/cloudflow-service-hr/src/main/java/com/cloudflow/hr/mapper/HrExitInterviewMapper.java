package com.cloudflow.hr.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.hr.domain.entity.HrExitInterview;
import com.cloudflow.hr.domain.vo.settlement.HrExitInterviewView;
import java.util.List;
import org.apache.ibatis.annotations.Param;

public interface HrExitInterviewMapper extends BaseMapper<HrExitInterview> {
    Long lock(@Param("tenantId") Long tenantId, @Param("identifier") Long identifier);
    Long lockApplication(@Param("tenantId") Long tenantId, @Param("identifier") Long identifier);
    int updateDraft(@Param("record") HrExitInterview record, @Param("expectedVersion") Integer expectedVersion);
    int bindAttachment(@Param("tenantId") Long tenantId, @Param("interviewId") Long interviewId,
            @Param("fileId") Long fileId, @Param("hash") String hash);
    AttachmentFile attachment(@Param("tenantId") Long tenantId, @Param("interviewId") Long interviewId,
            @Param("fileId") Long fileId);
    List<HrExitInterviewView.Option> userOptions(@Param("tenantId") Long tenantId, @Param("identifiers") List<Long> identifiers);
    List<HrExitInterviewView.Option> fileOptions(@Param("tenantId") Long tenantId, @Param("interviewId") Long interviewId);

    record AttachmentFile(Long fileId, String fileName, Long fileSize, String fileHash) { }
}
