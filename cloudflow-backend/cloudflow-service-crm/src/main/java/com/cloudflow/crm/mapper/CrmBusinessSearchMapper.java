package com.cloudflow.crm.mapper;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.common.core.search.BusinessSearchRow;
import com.cloudflow.common.datascope.DataScope;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface CrmBusinessSearchMapper {
    Page<BusinessSearchRow> customers(Page<BusinessSearchRow> page, @Param("tenantId") Long tenantId,
            @Param("pattern") String pattern, @Param("dataScope") DataScope dataScope);
    Page<BusinessSearchRow> tickets(Page<BusinessSearchRow> page, @Param("tenantId") Long tenantId,
            @Param("pattern") String pattern, @Param("userId") Long userId, @Param("deptId") Long deptId,
            @Param("dataScope") DataScope dataScope);
}
