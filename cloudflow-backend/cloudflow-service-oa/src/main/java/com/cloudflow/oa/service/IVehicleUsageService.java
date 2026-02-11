package com.cloudflow.oa.service;

import com.baomidou.mybatisplus.extension.service.IService;
import com.cloudflow.oa.domain.VehicleUsage;
import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.domain.R;

/**
 * 用车申请服务接口
 */
public interface IVehicleUsageService extends IService<VehicleUsage> {

    /**
     * 分页查询用车记录
     */
    PageResult<VehicleUsage> queryPage(VehicleUsage usage, PageQuery pageQuery);

    /**
     * 提交用车申请
     */
    R<Void> submitUsage(VehicleUsage usage);

    /**
     * 审批用车申请（通过/驳回）
     */
    R<Void> approveUsage(Long usageId, boolean approved, String remark);

    /**
     * 归还车辆（完成用车）
     */
    R<Void> returnVehicle(Long usageId, double endMileage, String remark);

    /**
     * 取消用车申请
     */
    R<Void> cancelUsage(Long usageId);
}
