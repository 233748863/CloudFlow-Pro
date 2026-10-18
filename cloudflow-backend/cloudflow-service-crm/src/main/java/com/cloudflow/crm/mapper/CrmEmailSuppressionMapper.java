package com.cloudflow.crm.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.crm.domain.CrmEmailSuppression;
import java.time.LocalDateTime;
import java.util.List;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface CrmEmailSuppressionMapper extends BaseMapper<CrmEmailSuppression> {
    boolean exists(@Param("tenantId") Long tenantId, @Param("emailHash") String emailHash);

    List<String> selectHashes(@Param("tenantId") Long tenantId, @Param("hashes") List<String> hashes);

    int insertOnce(CrmEmailSuppression suppression);

    int markLeadUnsubscribed(@Param("tenantId") Long tenantId, @Param("targetId") Long targetId,
            @Param("now") LocalDateTime now);

    int markCustomerUnsubscribed(@Param("tenantId") Long tenantId, @Param("targetId") Long targetId,
            @Param("now") LocalDateTime now);
}
