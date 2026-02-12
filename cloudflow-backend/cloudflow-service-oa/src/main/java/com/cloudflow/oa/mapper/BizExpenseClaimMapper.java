package com.cloudflow.oa.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.oa.domain.BizExpenseClaim;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.util.List;
import java.util.Map;

/**
 * 报销申请Mapper接口
 */
@Mapper
public interface BizExpenseClaimMapper extends BaseMapper<BizExpenseClaim> {

    /**
     * 查询报销申请详情（含明细）
     */
    BizExpenseClaim selectClaimWithItems(@Param("id") Long id);

    /**
     * 获取今日报销单号最大序号
     */
    @Select("SELECT MAX(CAST(SUBSTRING(claim_no, 11) AS UNSIGNED)) FROM biz_expense_claim " +
            "WHERE DATE(create_time) = CURDATE() AND claim_no LIKE CONCAT('BX', DATE_FORMAT(NOW(), '%Y%m%d'), '%')")
    Integer getTodayMaxSeq();

    /**
     * 按部门统计月度报销费用
     */
    List<Map<String, Object>> selectMonthlyExpenseByDept(@Param("month") String month);

    /**
     * 按类别统计月度报销费用
     */
    List<Map<String, Object>> selectMonthlyExpenseByCategory(@Param("month") String month);
}
