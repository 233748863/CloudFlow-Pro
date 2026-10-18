package com.cloudflow.crm.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.crm.domain.CrmSalesTarget;
import com.cloudflow.crm.service.deal.CrmReceiptAchievementService.Scope;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface CrmSalesTargetMapper extends BaseMapper<CrmSalesTarget> {
    Page<CrmSalesTarget> selectPageByDataScope(Page<CrmSalesTarget> page,
            @Param("query") CrmSalesTarget query, @Param("scope") Scope scope);
    CrmSalesTarget accessible(@Param("id") Long id, @Param("scope") Scope scope, @Param("lock") boolean lock);
    CrmSalesTarget byNumber(@Param("number") String number, @Param("tenantId") Long tenantId, @Param("lock") boolean lock);
    String departmentName(@Param("id") Long id, @Param("tenantId") Long tenantId);
    int write(@Param("row") CrmSalesTarget row);
    int markDeleted(@Param("row") CrmSalesTarget row);
}
