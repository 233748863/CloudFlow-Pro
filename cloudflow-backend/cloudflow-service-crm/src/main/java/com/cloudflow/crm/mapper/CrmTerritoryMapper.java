package com.cloudflow.crm.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.crm.domain.CrmTerritory;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface CrmTerritoryMapper extends BaseMapper<CrmTerritory> {
    java.util.List<CrmTerritory> lockTree();
}
