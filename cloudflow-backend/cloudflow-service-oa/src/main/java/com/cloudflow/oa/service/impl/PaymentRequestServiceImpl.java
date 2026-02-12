package com.cloudflow.oa.service.impl;

import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.cloudflow.oa.domain.BizPaymentRequest;
import com.cloudflow.oa.mapper.BizPaymentRequestMapper;
import com.cloudflow.oa.service.IPaymentRequestService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Map;

/**
 * 付款申请Service实现类
 */
@Service
public class PaymentRequestServiceImpl extends ServiceImpl<BizPaymentRequestMapper, BizPaymentRequest> 
        implements IPaymentRequestService {

    @Override
    public String generatePaymentNo() {
        String today = LocalDate.now().format(DateTimeFormatter.ofPattern("yyyyMMdd"));
        Integer maxSeq = baseMapper.getTodayMaxSeq();
        int nextSeq = (maxSeq == null ? 0 : maxSeq) + 1;
        return String.format("FK%s%04d", today, nextSeq);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public boolean submitPayment(Long id) {
        BizPaymentRequest payment = getById(id);
        if (payment == null) {
            return false;
        }
        
        // 更新状态为审批中
        payment.setStatus("PENDING");
        
        // TODO: 启动工作流
        // String instanceId = workflowService.startProcess("payment_request", payment);
        // payment.setInstanceId(instanceId);
        
        return updateById(payment);
    }

    @Override
    public List<Map<String, Object>> getMonthlyPaymentByDept(String month) {
        return baseMapper.selectMonthlyPaymentByDept(month);
    }
}
