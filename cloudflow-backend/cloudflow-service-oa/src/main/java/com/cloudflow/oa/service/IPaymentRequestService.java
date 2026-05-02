package com.cloudflow.oa.service;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.baomidou.mybatisplus.extension.service.IService;
import com.cloudflow.oa.domain.BizPaymentRequest;

import java.util.List;
import java.util.Map;

/**
 * 付款申请Service接口
 */
public interface IPaymentRequestService extends IService<BizPaymentRequest> {

    /**
     * 分页查询付款申请列表
     */
    Page<BizPaymentRequest> queryPage(Integer pageNum, Integer pageSize, String status, String paymentType, Long userId);

    /**
     * 查询付款申请导出列表
     */
    List<BizPaymentRequest> listForExport(String status, String paymentType, Long userId);

    /**
     * 生成付款单号
     */
    String generatePaymentNo();

    /**
     * 创建付款申请
     */
    boolean createPayment(BizPaymentRequest payment);

    /**
     * 更新付款申请
     */
    boolean updatePayment(BizPaymentRequest payment);

    /**
     * 提交付款申请（启动工作流）
     */
    boolean submitPayment(Long id);

    /**
     * 确认已付款。
     */
    boolean confirmPaid(Long id);

    /**
     * 按部门统计月度付款费用
     */
    List<Map<String, Object>> getMonthlyPaymentByDept(String month);
}
