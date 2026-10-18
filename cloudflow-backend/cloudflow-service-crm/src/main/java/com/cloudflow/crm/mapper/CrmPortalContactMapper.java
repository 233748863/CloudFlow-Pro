package com.cloudflow.crm.mapper;

import com.cloudflow.common.datascope.DataScope;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.crm.domain.CrmContact;
import java.util.List;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface CrmPortalContactMapper {
    List<Long> visibleContactIds(@Param("tenantId") Long tenantId, @Param("dataScope") DataScope dataScope);

    Page<CrmContact> candidates(Page<CrmContact> page, @Param("tenantId") Long tenantId,
            @Param("keyword") String keyword, @Param("dataScope") DataScope dataScope);
}
