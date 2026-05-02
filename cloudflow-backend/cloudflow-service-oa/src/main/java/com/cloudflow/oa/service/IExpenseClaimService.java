package com.cloudflow.oa.service;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.baomidou.mybatisplus.extension.service.IService;
import com.cloudflow.oa.domain.BizExpenseClaim;

import java.util.List;
import java.util.Map;

/**
 * 报销申请Service接口
 */
public interface IExpenseClaimService extends IService<BizExpenseClaim> {

    /**
     * 分页查询报销申请列表
     */
    Page<BizExpenseClaim> queryPage(Integer pageNum, Integer pageSize, String status, String category, Long userId);

    /**
     * 查询报销申请导出列表
     */
    List<BizExpenseClaim> listForExport(String status, String category, Long userId);

    /**
     * 查询报销申请详情（含明细）
     */
    BizExpenseClaim getClaimWithItems(Long id);

    /**
     * 生成报销单号
     */
    String generateClaimNo();

    /**
     * 创建报销申请（含明细）
     */
    boolean createClaim(BizExpenseClaim claim);

    /**
     * 更新报销申请（含明细）
     */
    boolean updateClaim(BizExpenseClaim claim);

    /**
     * 提交报销申请（启动工作流）
     */
    boolean submitClaim(Long id);

    /**
     * 车辆费用转报销单
     */
    boolean convertVehicleExpenseToClaim(List<Long> vehicleExpenseIds, Long userId);

    /**
     * 按部门统计月度报销费用
     */
    List<Map<String, Object>> getMonthlyExpenseByDept(String month);

    /**
     * 按类别统计月度报销费用
     */
    List<Map<String, Object>> getMonthlyExpenseByCategory(String month);
}
