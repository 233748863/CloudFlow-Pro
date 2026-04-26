package com.cloudflow.oa.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.cloudflow.common.audit.annotation.Audit;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.oa.config.WorkflowCallbackStreamConstants;
import com.cloudflow.oa.domain.BizExpenseClaim;
import com.cloudflow.oa.domain.BizExpenseItem;
import com.cloudflow.oa.domain.VehicleExpense;
import com.cloudflow.oa.mapper.BizExpenseClaimMapper;
import com.cloudflow.oa.mapper.BizExpenseItemMapper;
import com.cloudflow.oa.mapper.VehicleExpenseMapper;
import com.cloudflow.oa.service.IExpenseClaimService;
import com.cloudflow.oa.service.remote.RemoteWorkflowService;
import com.cloudflow.oa.util.OaAttachmentUrlUtils;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
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
    private VehicleExpenseMapper vehicleExpenseMapper;
    
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
    @Audit(name = "创建报销申请", spel = "#claim")
    @Transactional(rollbackFor = Exception.class)
    public boolean createClaim(BizExpenseClaim claim) {
        normalizeClaimItems(claim);
        // 从当前登录用户上下文中填充用户信息
        claim.setUserId(UserContext.getUserId());
        claim.setUserName(UserContext.getUserName());
        claim.setDeptId(UserContext.getDeptId());
        claim.setDeptName(UserContext.getDeptName());
        LocalDateTime now = LocalDateTime.now();
        claim.setCreateBy(UserContext.getUserName());
        claim.setCreateTime(now);
        claim.setUpdateTime(now);
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
    @Audit(name = "更新报销申请", spel = "#claim", oldVal = "@expenseClaimServiceImpl.getById(#claim.id)")
    @Transactional(rollbackFor = Exception.class)
    public boolean updateClaim(BizExpenseClaim claim) {
        normalizeClaimItems(claim);
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
    @Audit(name = "提交报销申请", spel = "#id", oldVal = "@expenseClaimServiceImpl.getById(#id)")
    @Transactional(rollbackFor = Exception.class)
    public boolean submitClaim(Long id) {
        BizExpenseClaim claim = getById(id);
        if (claim == null) {
            return false;
        }
        
        // 补偿逻辑：历史数据可能缺少用户信息，从当前登录上下文补充
        if (!StringUtils.hasText(claim.getDeptName())) {
            claim.setDeptName(UserContext.getDeptName());
        }
        if (claim.getDeptId() == null) {
            claim.setDeptId(UserContext.getDeptId());
        }
        if (!StringUtils.hasText(claim.getUserName())) {
            claim.setUserName(UserContext.getUserName());
        }
        if (claim.getUserId() == null) {
            claim.setUserId(UserContext.getUserId());
        }
        
        // 更新状态为审批中
        claim.setStatus("PENDING");
        
        // 启动工作流
        try {
            Map<String, Object> req = new HashMap<>();
            req.put("processDefKey", "expense_claim");
            req.put("businessKey", "EXPENSE_CLAIM:" + claim.getId());
            // 流程变量 - 包含完整业务字段，供审批人在审批卡片和详情中查看
            Map<String, Object> variables = new HashMap<>();
            variables.put("claimId", claim.getId());
            variables.put("claimNo", claim.getClaimNo());
            variables.put("totalAmount", claim.getTotalAmount());
            variables.put("userId", claim.getUserId());
            variables.put("userName", claim.getUserName());
            variables.put("category", claim.getCategory());
            variables.put("description", claim.getDescription());
            variables.put("deptName", claim.getDeptName());
            // 显式写入回调元数据，审批完成后由 OA 自己通过 Stream 回写业务状态。
            WorkflowCallbackStreamConstants.applyCallbackMetadata(
                    variables,
                    WorkflowCallbackStreamConstants.BUSINESS_TYPE_EXPENSE_CLAIM,
                    claim.getId(),
                    claim.getClaimNo()
            );
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
    @Audit(name = "车辆费用转报销", spel = "#vehicleExpenseIds")
    @Transactional(rollbackFor = Exception.class)
    public boolean convertVehicleExpenseToClaim(List<Long> vehicleExpenseIds, Long userId) {
        if (vehicleExpenseIds == null || vehicleExpenseIds.isEmpty()) {
            return false;
        }
        
        // 1. 批量查询车辆费用记录
        List<VehicleExpense> vehicleExpenses = vehicleExpenseMapper.selectBatchIds(vehicleExpenseIds);
        if (vehicleExpenses.isEmpty()) {
            log.warn("未找到对应的车辆费用记录，IDs: {}", vehicleExpenseIds);
            return false;
        }
        
        // 2. 创建报销申请单
        BizExpenseClaim claim = new BizExpenseClaim();
        claim.setClaimNo(generateClaimNo());
        claim.setUserId(userId);
        claim.setCategory("TRANSPORT"); // 车辆费用归类为交通类
        claim.setStatus("DRAFT");
        claim.setDescription("车辆费用转报销（共" + vehicleExpenses.size() + "笔）");
        LocalDateTime now = LocalDateTime.now();
        claim.setCreateTime(now);
        claim.setUpdateTime(now);
        
        // 3. 计算总金额
        BigDecimal totalAmount = vehicleExpenses.stream()
                .map(VehicleExpense::getAmount)
                .filter(amount -> amount != null)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        claim.setTotalAmount(totalAmount);
        
        boolean saved = save(claim);
        if (!saved) {
            return false;
        }
        
        // 4. 将每笔车辆费用转为报销明细
        for (VehicleExpense ve : vehicleExpenses) {
            BizExpenseItem item = new BizExpenseItem();
            item.setClaimId(claim.getId());
            item.setExpenseType(mapVehicleExpenseType(ve.getExpenseType()));
            item.setAmount(ve.getAmount());
            if (ve.getExpenseDate() != null) {
                item.setExpenseDate(ve.getExpenseDate());
            }
            item.setDescription(ve.getDescription());
            item.setReceiptUrl(
                    OaAttachmentUrlUtils.normalizeMultiAttachmentUrls(ve.getReceiptUrl(), "报销明细凭证附件")
            );
            item.setVehicleExpenseId(ve.getExpenseId()); // 关联原始车辆费用ID
            expenseItemMapper.insert(item);
        }
        
        log.info("车辆费用转报销成功，报销单号: {}，费用笔数: {}，总金额: {}", 
                claim.getClaimNo(), vehicleExpenses.size(), totalAmount);
        return true;
    }
    
    /**
     * 将车辆费用类型映射为报销费用类型
     * 车辆费用类型：1油费 2过路费 3停车费 4维修保养 5保险 6其他
     * 报销费用类型：TRANSPORT交通
     */
    private String mapVehicleExpenseType(String vehicleExpenseType) {
        if (vehicleExpenseType == null) {
            return "OTHER";
        }
        switch (vehicleExpenseType) {
            case "1": return "TRANSPORT";  // 油费 → 交通
            case "2": return "TRANSPORT";  // 过路费 → 交通
            case "3": return "TRANSPORT";  // 停车费 → 交通
            case "4": return "OTHER";      // 维修保养 → 其他
            case "5": return "OTHER";      // 保险 → 其他
            default:  return "OTHER";
        }
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

    private void normalizeClaimItems(BizExpenseClaim claim) {
        if (claim == null) {
            throw new IllegalArgumentException("报销申请不能为空");
        }
        if (claim.getItems() == null || claim.getItems().isEmpty()) {
            return;
        }
        for (BizExpenseItem item : claim.getItems()) {
            item.setReceiptUrl(
                    OaAttachmentUrlUtils.normalizeMultiAttachmentUrls(item.getReceiptUrl(), "报销明细凭证附件")
            );
        }
    }
}
