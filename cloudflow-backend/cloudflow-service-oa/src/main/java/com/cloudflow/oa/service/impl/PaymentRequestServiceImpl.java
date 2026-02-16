package com.cloudflow.oa.service.impl;

import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.cloudflow.common.audit.annotation.Audit;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.oa.domain.BizPaymentRequest;
import com.cloudflow.oa.mapper.BizPaymentRequestMapper;
import com.cloudflow.oa.service.IPaymentRequestService;
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
 * 付款申请Service实现类
 */
@Slf4j
@Service
public class PaymentRequestServiceImpl extends ServiceImpl<BizPaymentRequestMapper, BizPaymentRequest> 
        implements IPaymentRequestService {

    @Autowired
    private RemoteWorkflowService remoteWorkflowService;

    @Override
    public String generatePaymentNo() {
        String today = LocalDate.now().format(DateTimeFormatter.ofPattern("yyyyMMdd"));
        Integer maxSeq = baseMapper.getTodayMaxSeq();
        int nextSeq = (maxSeq == null ? 0 : maxSeq) + 1;
        return String.format("FK%s%04d", today, nextSeq);
    }

    @Override
    @Audit(name = "提交付款申请", spel = "#id", oldVal = "@paymentRequestServiceImpl.getById(#id)")
    @Transactional(rollbackFor = Exception.class)
    public boolean submitPayment(Long id) {
        BizPaymentRequest payment = getById(id);
        if (payment == null) {
            return false;
        }
        
        // 更新状态为审批中
        payment.setStatus("PENDING");
        
        // 启动工作流
        try {
            Map<String, Object> req = new HashMap<>();
            req.put("processDefKey", "payment_request");
            req.put("businessKey", "PAYMENT_REQUEST:" + payment.getId());
            // 流程变量 - 包含完整业务字段，供审批人在审批卡片和详情中查看
            Map<String, Object> variables = new HashMap<>();
            variables.put("paymentId", payment.getId());
            variables.put("paymentNo", payment.getPaymentNo());
            variables.put("amount", payment.getAmount());
            variables.put("userId", payment.getUserId());
            variables.put("userName", payment.getUserName());
            variables.put("paymentType", payment.getPaymentType());
            variables.put("payeeName", payment.getPayeeName());
            variables.put("payeeAccount", payment.getPayeeAccount());
            variables.put("payeeBank", payment.getPayeeBank());
            variables.put("reason", payment.getReason());
            variables.put("deptName", payment.getDeptName());
            req.put("variables", variables);
            
            R<?> result = remoteWorkflowService.startProcess(req);
            if (result != null && result.getCode() == 200 && result.getData() != null) {
                // 从返回结果中提取流程实例ID
                String instanceId = extractInstanceId(result.getData());
                if (instanceId != null) {
                    payment.setInstanceId(instanceId);
                }
                log.info("付款申请 {} 工作流启动成功，流程实例ID: {}", payment.getPaymentNo(), instanceId);
            } else {
                log.warn("付款申请 {} 工作流启动返回异常: {}", payment.getPaymentNo(), result != null ? result.getMsg() : "null");
            }
        } catch (Exception e) {
            // 工作流启动失败不影响提交，状态已更新为PENDING
            log.error("付款申请 {} 启动工作流失败，但提交状态已更新", payment.getPaymentNo(), e);
        }
        
        return updateById(payment);
    }

    @Override
    public List<Map<String, Object>> getMonthlyPaymentByDept(String month) {
        return baseMapper.selectMonthlyPaymentByDept(month);
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
