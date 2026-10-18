package com.cloudflow.oa.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.oa.domain.SysConsumable;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.oa.domain.dto.ConsumableQuery;
import com.cloudflow.oa.domain.vo.ConsumableResults;

import java.util.List;

@Mapper
public interface SysConsumableMapper extends BaseMapper<SysConsumable> {

    List<SysConsumable> selectLowStockList(@Param("tenantId") Long tenantId);
    SysConsumable selectForUpdate(@Param("tenantId") Long tenantId, @Param("id") Long id);
    int updateBalance(@Param("record") SysConsumable record);
    int updateMaster(@Param("record") SysConsumable record);
    int softDelete(@Param("record") SysConsumable record);
    int referenceCount(@Param("tenantId") Long tenantId, @Param("id") Long id);
    List<ConsumableResults.Category> categories(@Param("tenantId") Long tenantId);
    int categoryExists(@Param("tenantId") Long tenantId, @Param("id") Long id);
    Page<ConsumableResults.CatalogItem> catalog(Page<ConsumableResults.CatalogItem> page,
            @Param("tenantId") Long tenantId, @Param("query") ConsumableQuery query);
    List<Long> batchIds(@Param("tenantId") Long tenantId, @Param("afterId") Long afterId);
    int closeRecoveredRisks(@Param("tenantId") Long tenantId, @Param("id") Long id);
}
