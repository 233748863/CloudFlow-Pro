package com.cloudflow.oa.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.oa.domain.BizExpenseClaim;
import com.cloudflow.oa.domain.BizExpenseItem;
import com.cloudflow.oa.mapper.BizExpenseClaimMapper;
import com.cloudflow.oa.mapper.BizExpenseItemMapper;
import com.cloudflow.oa.service.IExpenseClaimService;
import com.cloudflow.oa.service.remote.RemoteWorkflowService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 报销申请Service实现类
 */
@Slf4j
@Service
public class ExpenseClaimServiceImpl extends ServiceImpl<BizExpenseClaimMapper, BizExpenseClaim> 
        implements IExpenseClaimService {

    @Autowired
    private BizExpenseItemMapper expenseItemMapper;
    
    @Autowired
    private RemoteWorkflowService remoteWorkflowService;

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
        
        // 启动工作流
        try {
            Map<String, Object> req = new HashMap<>();
            req.put("processDefinitionKey", "expense_claim");
            req.put("businessKey", "EXPENSE_CLAIM:" + claim.getId());
            // 流程变量：传递报销单关键信息
            Map<String, Object> variables = new HashMap<>();
            variables.put("claimId", claim.getId());
            variables.put("claimNo", claim.getClaimNo());
            variables.put("totalAmount", claim.getTotalAmount());
            variables.put("userId", claim.getUserId());
            variables.put("category", claim.getCategory());
            req.put("variables", variables);
            
            R<?> result = remoteWorkflowService.startProcess(req);
            if (result != null && result.getCode() == 200 && result.getData() != null) {
                // 从返回结果中提取流程实例ID
                String instanceId = extractInstanceId(result.getData());
                if (instanceId != null) {
                    claim.setInstanceId(instanceId);
                }
                log.info("报销申请 {} 工作流启动成功，流程实例ID: {}", claim.getClaimNo(), instanceId);
            } else {
                log.warn("报销申请 {} 工作流启动返回异常: {}", claim.getClaimNo(), result != null ? result.getMsg() : "null");
            }
        } catch (Exception e) {
            // 工作流启动失败不影响提交，状态已更新为PENDING
            log.error("报销申请 {} 启动工作流失败，但提交状态已更新", claim.getClaimNo(), e);
        }
        
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
    
    /**
     * 从工作流启动结果中提取流程实例ID
     * 
     * @param data 工作流返回的数据
     * @return 流程实例ID，提取失败返回null
     */
    private String extractInstanceId(Object data) {
        if (data instanceof Map) {
            @SuppressWarnings("unchecked")
            Map<String, Object> dataMap = (Map<String, Object>) data;
            Object instanceId = dataMap.get("processInstanceId");
            if (instanceId == null) {
                instanceId = dataMap.get("instanceId");
            }
            return instanceId != null ? String.valueOf(instanceId) : null;
        }
        if (data instanceof String) {
            return (String) data;
        }
        return null;
    }
}
