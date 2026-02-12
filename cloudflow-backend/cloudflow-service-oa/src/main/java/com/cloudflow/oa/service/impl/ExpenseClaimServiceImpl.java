package com.cloudflow.oa.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.cloudflow.oa.domain.BizExpenseClaim;
import com.cloudflow.oa.domain.BizExpenseItem;
import com.cloudflow.oa.mapper.BizExpenseClaimMapper;
import com.cloudflow.oa.mapper.BizExpenseItemMapper;
import com.cloudflow.oa.service.IExpenseClaimService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Map;

/**
 * 报销申请Service实现类
 */
@Service
public class ExpenseClaimServiceImpl extends ServiceImpl<BizExpenseClaimMapper, BizExpenseClaim> 
        implements IExpenseClaimService {

    @Autowired
    private BizExpenseItemMapper expenseItemMapper;

    @Override
    public BizExpenseClaim getClaimWithItems(Long id) {
        return baseMapper.selectClaimWithItems(id);
    }

    @Override
    public String generateClaimNo() {
        String today = LocalDate.now().format(DateTimeFormatter.ofPattern("yyyyMMdd"));
        Integer maxSeq = baseMapper.getTodayMaxSeq();
        int nextSeq = (maxSeq == null ? 0 : maxSeq) + 1;
        return String.format("BX%s%04d", today, nextSeq);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public boolean createClaim(BizExpenseClaim claim) {
        // 生成报销单号
        claim.setClaimNo(generateClaimNo());
        claim.setStatus("DRAFT");
        
        // 保存报销申请
        boolean result = save(claim);
        
        // 保存报销明细
        if (result && claim.getItems() != null && !claim.getItems().isEmpty()) {
            for (BizExpenseItem item : claim.getItems()) {
                item.setClaimId(claim.getId());
                expenseItemMapper.insert(item);
            }
        }
        
        return result;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public boolean updateClaim(BizExpenseClaim claim) {
        // 更新报销申请
        boolean result = updateById(claim);
        
        // 删除旧的报销明细
        if (result) {
            LambdaQueryWrapper<BizExpenseItem> wrapper = new LambdaQueryWrapper<>();
            wrapper.eq(BizExpenseItem::getClaimId, claim.getId());
            expenseItemMapper.delete(wrapper);
            
            // 保存新的报销明细
            if (claim.getItems() != null && !claim.getItems().isEmpty()) {
                for (BizExpenseItem item : claim.getItems()) {
                    item.setClaimId(claim.getId());
                    expenseItemMapper.insert(item);
                }
            }
        }
        
        return result;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public boolean submitClaim(Long id) {
        BizExpenseClaim claim = getById(id);
        if (claim == null) {
            return false;
        }
        
        // 更新状态为审批中
        claim.setStatus("PENDING");
        
        // TODO: 启动工作流
        // String instanceId = workflowService.startProcess("expense_claim", claim);
        // claim.setInstanceId(instanceId);
        
        return updateById(claim);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public boolean convertVehicleExpenseToClaim(List<Long> vehicleExpenseIds, Long userId) {
        // TODO: 此功能需要车辆费用模块支持，暂时返回false
        // 当SysVehicleExpense和SysVehicleExpenseMapper实现后，可以启用此功能
        return false;
    }

    @Override
    public List<Map<String, Object>> getMonthlyExpenseByDept(String month) {
        return baseMapper.selectMonthlyExpenseByDept(month);
    }

    @Override
    public List<Map<String, Object>> getMonthlyExpenseByCategory(String month) {
        return baseMapper.selectMonthlyExpenseByCategory(month);
    }
}
