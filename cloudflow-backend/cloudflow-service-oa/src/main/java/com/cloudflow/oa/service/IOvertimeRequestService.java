package com.cloudflow.oa.service;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.service.IService;
import com.cloudflow.oa.domain.OvertimeRequest;

/**
 * 加班申请 Service 接口
 */
public interface IOvertimeRequestService extends IService<OvertimeRequest> {

    /** 分页查询 */
    IPage<OvertimeRequest> queryPage(OvertimeRequest query, int pageNum, int pageSize);

    /** 生成加班单号 */
    String generateOvertimeNo();

    /** 创建加班申请 */
    boolean createOvertime(OvertimeRequest overtime);

    /** 提交加班申请（启动工作流） */
    boolean submitOvertime(Long id);

    /** 取消加班申请 */
    boolean cancelOvertime(Long id);
}
