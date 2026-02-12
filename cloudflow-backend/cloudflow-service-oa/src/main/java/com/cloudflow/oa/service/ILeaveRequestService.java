package com.cloudflow.oa.service;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.service.IService;
import com.cloudflow.oa.domain.LeaveRequest;

/**
 * 请假申请 Service 接口
 */
public interface ILeaveRequestService extends IService<LeaveRequest> {

    /**
     * 分页查询请假申请
     */
    IPage<LeaveRequest> queryPage(LeaveRequest query, int pageNum, int pageSize);

    /**
     * 生成请假单号
     */
    String generateLeaveNo();

    /**
     * 创建请假申请
     */
    boolean createLeave(LeaveRequest leave);

    /**
     * 提交请假申请（启动工作流）
     */
    boolean submitLeave(Long id);

    /**
     * 取消请假申请
     */
    boolean cancelLeave(Long id);
}
