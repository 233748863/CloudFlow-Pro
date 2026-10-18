package com.cloudflow.hr.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.hr.domain.entity.HrSeveranceRule;
import com.cloudflow.hr.domain.vo.settlement.HrSeveranceRuleView;
import java.util.List;
import org.apache.ibatis.annotations.Param;

public interface HrSeveranceRuleMapper extends BaseMapper<HrSeveranceRule> {
    Long lock(@Param("tenantId") Long tenantId, @Param("identifier") Long identifier);
    int updateDraft(@Param("record") HrSeveranceRule record, @Param("expectedVersion") Integer expectedVersion);
    int referenced(@Param("tenantId") Long tenantId, @Param("identifier") Long identifier);
    List<HrSeveranceRuleView.Component> components(@Param("tenantId") Long tenantId);
    HrSeveranceRuleView.Component lockComponent(@Param("tenantId") Long tenantId, @Param("identifier") Long identifier);
    PolicyFile policyFile(@Param("tenantId") Long tenantId, @Param("identifier") Long identifier, @Param("fileId") Long fileId);
    int bindPolicyFile(@Param("tenantId") Long tenantId, @Param("identifier") Long identifier,
                       @Param("fileId") Long fileId, @Param("hash") String hash, @Param("uploader") String uploader);
    int retirePolicyFile(@Param("tenantId") Long tenantId, @Param("identifier") Long identifier, @Param("fileId") Long fileId);
    record PolicyFile(Long fileId, String fileName, Long fileSize, String fileHash) { }
}
