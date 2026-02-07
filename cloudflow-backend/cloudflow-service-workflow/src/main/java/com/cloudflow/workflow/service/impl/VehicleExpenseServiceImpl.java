package com.cloudflow.workflow.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.workflow.domain.VehicleExpense;
import com.cloudflow.workflow.mapper.VehicleExpenseMapper;
import com.cloudflow.workflow.service.IVehicleExpenseService;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Service
public class VehicleExpenseServiceImpl extends ServiceImpl<VehicleExpenseMapper, VehicleExpense> implements IVehicleExpenseService {

    @Override
    public PageResult<VehicleExpense> queryPage(VehicleExpense expense, PageQuery pageQuery) {
        LambdaQueryWrapper<VehicleExpense> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(expense.getVehicleId() != null, VehicleExpense::getVehicleId, expense.getVehicleId())
               .eq(expense.getUsageId() != null, VehicleExpense::getUsageId, expense.getUsageId());
        
        Page<VehicleExpense> page = this.page(pageQuery.build(), wrapper);
        return PageResult.build(page);
    }

    @Override
    public Map<String, Object> getExpenseStats(String startDate, String endDate) {
        // Simple statistics implementation
        LambdaQueryWrapper<VehicleExpense> wrapper = new LambdaQueryWrapper<>();
        if (startDate != null && endDate != null) {
            wrapper.between(VehicleExpense::getExpenseDate, startDate, endDate);
        }
        
        List<VehicleExpense> list = this.list(wrapper);
        
        BigDecimal total = list.stream().map(VehicleExpense::getAmount).reduce(BigDecimal.ZERO, BigDecimal::add);
        
        Map<String, Object> result = new HashMap<>();
        result.put("totalAmount", total);
        result.put("count", list.size());
        
        // Group by type could be added here
        
        return result;
    }
}
