package com.cloudflow.crm.mapper;

import com.baomidou.mybatisplus.annotation.InterceptorIgnore;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.crm.domain.CrmMassEmailRecipient;
import java.util.List;
import java.util.Map;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface CrmMassEmailRecipientMapper extends BaseMapper<CrmMassEmailRecipient> {
    CrmMassEmailRecipient selectForUpdate(@Param("tenantId") Long tenantId, @Param("recipientId") Long recipientId);

    @InterceptorIgnore(tenantLine = "true")
    CrmMassEmailRecipient selectByOpenToken(@Param("tokenHash") String tokenHash);

    @InterceptorIgnore(tenantLine = "true")
    CrmMassEmailRecipient selectByUnsubscribeToken(@Param("tokenHash") String tokenHash);

    List<CrmMassEmailRecipient> selectPending(@Param("tenantId") Long tenantId, @Param("massEmailId") Long massEmailId,
            @Param("testFlag") int testFlag, @Param("limit") int limit);

    int updateSnapshot(CrmMassEmailRecipient recipient);

    int stopPending(@Param("tenantId") Long tenantId, @Param("massEmailId") Long massEmailId, @Param("status") String status);

    List<Map<String, Object>> counts(@Param("tenantId") Long tenantId, @Param("massEmailId") Long massEmailId);
}
