package com.cloudflow.oa.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.common.datascope.DataScope;
import com.cloudflow.oa.domain.OaConsumableRequest;
import com.cloudflow.oa.domain.OaTraceEvent;
import com.cloudflow.oa.domain.dto.ConsumableQuery;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import java.util.Map;

@Mapper
public interface OaConsumableRequestMapper extends BaseMapper<OaConsumableRequest> {
    OaConsumableRequest lock(@Param("tenantId") Long tenantId, @Param("id") Long id);
    OaConsumableRequest byCreateKey(@Param("tenantId") Long tenantId, @Param("key") String key);
    OaConsumableRequest visible(@Param("tenantId") Long tenantId, @Param("id") Long id,
            @Param("applicantId") Long applicantId, @Param("dataScope") DataScope dataScope);
    Page<OaConsumableRequest> requestPage(Page<OaConsumableRequest> page, @Param("tenantId") Long tenantId,
            @Param("query") ConsumableQuery query, @Param("applicantId") Long applicantId,
            @Param("dispatch") boolean dispatch, @Param("dataScope") DataScope dataScope);
    int saveState(@Param("record") OaConsumableRequest record);
    int approverAllowed(@Param("tenantId") Long tenantId, @Param("userId") Long userId);
    Map<String, Object> ruleVersion(@Param("tenantId") Long tenantId, @Param("code") String code);
    OaTraceEvent operationTrace(@Param("tenantId") Long tenantId, @Param("businessId") Long businessId,
            @Param("eventType") String eventType, @Param("key") String key);
}
