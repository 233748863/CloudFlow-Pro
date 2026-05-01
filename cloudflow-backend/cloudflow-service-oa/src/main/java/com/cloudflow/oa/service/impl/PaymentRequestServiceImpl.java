package com.cloudflow.oa.service.impl;

import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.cloudflow.common.audit.annotation.Audit;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.oa.config.WorkflowCallbackStreamConstants;
import com.cloudflow.oa.domain.BizPaymentRequest;
import com.cloudflow.oa.domain.BizPurchaseRequest;
import com.cloudflow.oa.domain.dto.WorkflowProcessStartDTO;
import com.cloudflow.oa.mapper.BizPaymentRequestMapper;
import com.cloudflow.oa.mapper.BizPurchaseRequestMapper;
import com.cloudflow.oa.service.IPaymentRequestService;
import com.cloudflow.oa.service.remote.RemoteWorkflowService;
import com.cloudflow.oa.util.OaAttachmentUrlUtils;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDate;
import java.time.LocalDateTime;
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

    @Autowired
    private BizPurchaseRequestMapper purchaseRequestMapper;

    @Override
    public String generatePaymentNo() {
        String today = LocalDate.now().format(DateTimeFormatter.ofPattern("yyyyMMdd"));
        Integer maxSeq = baseMapper.getTodayMaxSeq();
        int nextSeq = (maxSeq == null ? 0 : maxSeq) + 1;
        return String.format("FK%s%04d", today, nextSeq);
    }

    @Override
    @Audit(name = "创建付款申请", spel = "#payment")
    public boolean createPayment(BizPaymentRequest payment) {
        normalizePaymentAttachment(payment);
        return save(payment);
    }

    @Override
    @Audit(name = "更新付款申请", spel = "#payment", oldVal = "@paymentRequestServiceImpl.getById(#payment.id)")
    public boolean updatePayment(BizPaymentRequest payment) {
        normalizePaymentAttachment(payment);
        return updateById(payment);
    }

    @Override
    @Audit(name = "提交付款申请", spel = "#id", oldVal = "@paymentRequestServiceImpl.getById(#id)")
    @Transactional(rollbackFor = Exception.class)
    public boolean submitPayment(Long id) {
        BizPaymentRequest payment = getById(id);
        if (payment == null) {
            return false;
        }
        normalizePaymentAttachment(payment);
        
        // 补偿逻辑：历史数据可能缺少用户信息，从当前登录上下文补充
        if (!StringUtils.hasText(payment.getDeptName())) {
            payment.setDeptName(UserContext.getDeptName());
        }
        if (payment.getDeptId() == null) {
            payment.setDeptId(UserContext.getDeptId());
        }
        if (!StringUtils.hasText(payment.getUserName())) {
            payment.setUserName(UserContext.getUserName());
        }
        if (payment.getUserId() == null) {
            payment.setUserId(UserContext.getUserId());
        }
        
        // 更新状态为审批中
        payment.setStatus("PENDING");
        updatePurchasePaymentStatus(payment.getId(), "PENDING");
        
        // 启动工作流
        try {
            WorkflowProcessStartDTO req = new WorkflowProcessStartDTO();
            req.setProcessDefKey("payment_request");
            req.setBusinessKey("PAYMENT_REQUEST:" + payment.getId());
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
            // 显式写入回调元数据，审批完成后由 OA 自己通过 Stream 回写业务状态。
            WorkflowCallbackStreamConstants.applyCallbackMetadata(
                    variables,
                    WorkflowCallbackStreamConstants.BUSINESS_TYPE_PAYMENT_REQUEST,
                    payment.getId(),
                    payment.getPaymentNo()
            );
            req.setVariables(variables);
            
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
    @Audit(name = "确认付款", spel = "#id", oldVal = "@paymentRequestServiceImpl.getById(#id)")
    @Transactional(rollbackFor = Exception.class)
    public boolean confirmPaid(Long id) {
        BizPaymentRequest payment = getById(id);
        if (payment == null || !"0".equals(payment.getDelFlag())) {
            throw new IllegalArgumentException("付款申请不存在");
        }
        if (!"APPROVED".equals(payment.getStatus())) {
            throw new IllegalArgumentException("只有审批通过的付款申请可以确认付款");
        }
        payment.setStatus("PAID");
        payment.setUpdateBy(UserContext.getUserName());
        payment.setUpdateTime(LocalDateTime.now());
        boolean updated = updateById(payment);
        if (updated) {
            updatePurchasePaymentStatus(id, "PAID");
        }
        return updated;
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

    private void normalizePaymentAttachment(BizPaymentRequest payment) {
        if (payment == null) {
            throw new IllegalArgumentException("付款申请不能为空");
        }
        payment.setAttachmentUrl(
                OaAttachmentUrlUtils.normalizeMultiAttachmentUrls(payment.getAttachmentUrl(), "付款申请附件")
        );
    }

    private void updatePurchasePaymentStatus(Long paymentRequestId, String paymentStatus) {
        if (paymentRequestId == null || !StringUtils.hasText(paymentStatus)) {
            return;
        }
        LambdaUpdateWrapper<BizPurchaseRequest> wrapper = new LambdaUpdateWrapper<>();
        wrapper.eq(BizPurchaseRequest::getPaymentRequestId, paymentRequestId)
                .eq(BizPurchaseRequest::getDelFlag, "0")
                .set(BizPurchaseRequest::getPaymentStatus, paymentStatus)
                .set(BizPurchaseRequest::getUpdateBy, UserContext.getUserName())
                .set(BizPurchaseRequest::getUpdateTime, LocalDateTime.now());
        purchaseRequestMapper.update(null, wrapper);
    }
}
