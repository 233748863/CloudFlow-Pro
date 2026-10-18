package com.cloudflow.oa.mapper;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.common.core.search.BusinessSearchRow;
import com.cloudflow.common.datascope.DataScope;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface OaBusinessSearchMapper {
    Page<BusinessSearchRow> contracts(Page<BusinessSearchRow> page, @Param("tenantId") Long tenantId,
            @Param("pattern") String pattern, @Param("dataScope") DataScope dataScope);
    Page<BusinessSearchRow> assets(Page<BusinessSearchRow> page, @Param("tenantId") Long tenantId,
            @Param("pattern") String pattern);
}
