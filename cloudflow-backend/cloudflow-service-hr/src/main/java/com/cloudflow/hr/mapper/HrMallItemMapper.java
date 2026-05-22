package com.cloudflow.hr.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.hr.domain.entity.HrMallItem;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Update;

public interface HrMallItemMapper extends BaseMapper<HrMallItem> {

    @Update("UPDATE hr_mall_item SET stock = stock - #{quantity}, sales_count = sales_count + #{quantity}, "
            + "update_time = NOW() WHERE id = #{itemId} AND tenant_id = #{tenantId} "
            + "AND stock >= #{quantity} AND deleted = 0 AND status = 'ON_SHELF'")
    int deductStock(@Param("itemId") Long itemId,
                    @Param("tenantId") Long tenantId,
                    @Param("quantity") Integer quantity);

    @Update("UPDATE hr_mall_item SET stock = stock + #{quantity}, sales_count = sales_count - #{quantity}, "
            + "update_time = NOW() WHERE id = #{itemId} AND tenant_id = #{tenantId} AND deleted = 0")
    int restoreStock(@Param("itemId") Long itemId,
                     @Param("tenantId") Long tenantId,
                     @Param("quantity") Integer quantity);
}
