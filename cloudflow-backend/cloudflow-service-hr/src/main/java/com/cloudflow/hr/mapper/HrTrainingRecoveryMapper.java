package com.cloudflow.hr.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.hr.domain.entity.HrTrainingRecovery;
import java.util.List;
import org.apache.ibatis.annotations.Param;

public interface HrTrainingRecoveryMapper extends BaseMapper<HrTrainingRecovery> {
    Long lock(@Param("tenantId") Long tenantId, @Param("identifier") Long identifier);
    Long lockEnrollment(@Param("tenantId") Long tenantId, @Param("identifier") Long identifier);
    Source source(@Param("tenantId") Long tenantId, @Param("identifier") Long identifier);
    List<Source> sources(@Param("tenantId") Long tenantId, @Param("employeeIds") List<Long> employeeIds);
    int stageAgreement(@Param("tenantId") Long tenantId, @Param("fileId") Long fileId,
            @Param("enrollmentId") Long enrollmentId, @Param("hash") String hash, @Param("uploader") String uploader);
    AgreementFile agreement(@Param("tenantId") Long tenantId, @Param("fileId") Long fileId);
    AgreementFile readAgreement(@Param("tenantId") Long tenantId, @Param("fileId") Long fileId);
    Long stagedAgreement(@Param("tenantId") Long tenantId, @Param("enrollmentId") Long enrollmentId,
            @Param("hash") String hash, @Param("uploader") String uploader);
    Long assessedAgreement(@Param("tenantId") Long tenantId, @Param("enrollmentId") Long enrollmentId, @Param("hash") String hash);
    int bindAgreement(@Param("tenantId") Long tenantId, @Param("fileId") Long fileId,
            @Param("enrollmentId") Long enrollmentId, @Param("recoveryId") Long recoveryId, @Param("uploader") String uploader);
    int updateDraft(@Param("record") HrTrainingRecovery record, @Param("expectedVersion") Integer expectedVersion);

    record Source(Long enrollmentId, Long employeeId, String employeeName, Long sessionId, String sessionNo,
            String courseName, String status, Integer version) { }
    record AgreementFile(Long fileId, String fileName, Long fileSize, String fileHash, String bizType, Long bizId, String createBy) { }
}
