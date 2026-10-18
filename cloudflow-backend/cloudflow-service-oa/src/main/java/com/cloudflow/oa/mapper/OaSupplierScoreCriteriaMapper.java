package com.cloudflow.oa.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.oa.domain.OaSupplierScoreCriteria;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import java.util.List;

@Mapper
public interface OaSupplierScoreCriteriaMapper extends BaseMapper<OaSupplierScoreCriteria> {
    OaSupplierScoreCriteria selectForUpdate(@Param("id") Long id, @Param("tenantId") Long tenantId);
    List<OaSupplierScoreCriteria> selectHistoryForUpdate(@Param("scorecardId") Long scorecardId, @Param("tenantId") Long tenantId);
    int restoreDraftCriterion(@Param("item") OaSupplierScoreCriteria item);
}
