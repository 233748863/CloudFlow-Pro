package com.cloudflow.hr.mapper;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.common.core.search.BusinessSearchRow;
import com.cloudflow.hr.service.HrEmployeeReadScope;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface HrBusinessSearchMapper {
    Page<BusinessSearchRow> employees(Page<BusinessSearchRow> page, @Param("tenantId") Long tenantId,
            @Param("pattern") String pattern, @Param("scope") HrEmployeeReadScope scope);
}
