package com.cloudflow.hr.mapper;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

/**
 * HR 审计日志写入。
 * hr_audit_log 是 HR 域内的写多读少基础设施表，目前仅 service 层按需 insert，
 * 暂不建 entity / BaseMapper。
 */
@Mapper
public interface HrAuditLogMapper {

    /**
     * 写一条 HR 审计日志。before/after 调用方序列化为 JSON 字符串。
     */
    int insertLog(@Param("tenantId") Long tenantId,
                  @Param("businessDomain") String businessDomain,
                  @Param("businessId") Long businessId,
                  @Param("operationType") String operationType,
                  @Param("operatorId") Long operatorId,
                  @Param("operatorName") String operatorName,
                  @Param("beforeData") String beforeData,
                  @Param("afterData") String afterData);
}
