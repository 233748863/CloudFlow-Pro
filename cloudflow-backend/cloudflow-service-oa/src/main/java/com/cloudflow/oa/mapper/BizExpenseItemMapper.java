package com.cloudflow.oa.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.oa.domain.BizExpenseItem;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.time.LocalDate;
import java.util.List;
import java.util.Set;

/**
 * 报销明细Mapper接口
 */
@Mapper
public interface BizExpenseItemMapper extends BaseMapper<BizExpenseItem> {
    List<BizExpenseItem> selectCommittedUsage(@Param("tenantId") Long tenantId,
                                             @Param("userId") Long userId,
                                             @Param("excludeClaimId") Long excludeClaimId,
                                             @Param("from") LocalDate from,
                                             @Param("until") LocalDate until,
                                             @Param("expenseTypes") Set<String> expenseTypes);
}
