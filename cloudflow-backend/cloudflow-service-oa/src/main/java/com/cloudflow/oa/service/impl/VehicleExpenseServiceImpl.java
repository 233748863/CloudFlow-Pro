package com.cloudflow.oa.service.impl;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.oa.domain.VehicleExpense;
import com.cloudflow.oa.mapper.VehicleExpenseMapper;
import com.cloudflow.oa.service.IVehicleExpenseService;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Service
public class VehicleExpenseServiceImpl extends ServiceImpl<VehicleExpenseMapper, VehicleExpense>
        implements IVehicleExpenseService {

    @Override
    public PageResult<VehicleExpense> queryPage(VehicleExpense expense, PageQuery pageQuery, String startDate, String endDate) {
        Page<VehicleExpense> page = (Page<VehicleExpense>) baseMapper.selectExpensePage(pageQuery.build(), expense, startDate, endDate);
        return PageResult.build(page);
    }

    @Override
    public Map<String, Object> getExpenseStats(String startDate, String endDate) {
        Map<String, Object> result = new HashMap<>();
        Map<String, Object> summary = baseMapper.selectExpenseStats(startDate, endDate);
        if (summary != null) {
            result.putAll(summary);
        }
        Map<String, Object> byType = new HashMap<>();
        List<Map<String, Object>> grouped = baseMapper.selectExpenseGroupByType(startDate, endDate);
        if (grouped != null) {
            for (Map<String, Object> item : grouped) {
                Object type = item.get("expenseType");
                Object amount = item.get("amount");
                if (type != null) {
                    byType.put(String.valueOf(type), amount == null ? BigDecimal.ZERO : amount);
                }
            }
        }
        result.put("byType", byType);
        result.putIfAbsent("totalAmount", BigDecimal.ZERO);
        result.putIfAbsent("count", 0L);
        result.putIfAbsent("monthlyAmount", BigDecimal.ZERO);
        result.putIfAbsent("lastMonthAmount", BigDecimal.ZERO);
        return result;
    }

    @Override
    public List<VehicleExpense> listRecentByVehicleId(Long vehicleId, Integer limit) {
        return baseMapper.selectRecentExpensesByVehicleId(vehicleId, limit == null || limit <= 0 ? 10 : limit);
    }
}
