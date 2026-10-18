package com.cloudflow.oa.mapper;

import com.baomidou.mybatisplus.annotation.InterceptorIgnore;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.oa.domain.OaConsumableRequestItem;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import java.util.List;

@Mapper
public interface OaConsumableRequestItemMapper extends BaseMapper<OaConsumableRequestItem> {
    List<OaConsumableRequestItem> items(@Param("tenantId") Long tenantId, @Param("requestId") Long requestId);
    @InterceptorIgnore(tenantLine = "true")
    List<OaConsumableRequestItem> lockItems(@Param("tenantId") Long tenantId, @Param("requestId") Long requestId);
    int saveState(@Param("record") OaConsumableRequestItem record);
    int replaceDraftLines(@Param("tenantId") Long tenantId, @Param("requestId") Long requestId);
}
