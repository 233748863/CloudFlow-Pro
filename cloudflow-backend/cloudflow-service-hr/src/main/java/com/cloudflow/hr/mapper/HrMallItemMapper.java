package com.cloudflow.hr.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.hr.domain.entity.HrMallItem;
import org.apache.ibatis.annotations.Param;

public interface HrMallItemMapper extends BaseMapper<HrMallItem> {

    int deductStock(@Param("itemId") Long itemId,
                    @Param("tenantId") Long tenantId,
                    @Param("quantity") Integer quantity);

    int restoreStock(@Param("itemId") Long itemId,
                     @Param("tenantId") Long tenantId,
                     @Param("quantity") Integer quantity);
}
