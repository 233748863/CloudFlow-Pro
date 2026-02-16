package com.cloudflow.oa.service;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.service.IService;
import com.cloudflow.oa.domain.BusinessTrip;

/**
 * 出差申请 Service 接口
 */
public interface IBusinessTripService extends IService<BusinessTrip> {

    /** 分页查询 */
    IPage<BusinessTrip> queryPage(BusinessTrip query, int pageNum, int pageSize);

    /** 生成出差单号 */
    String generateTripNo();

    /** 创建出差申请 */
    boolean createTrip(BusinessTrip trip);

    /** 提交出差申请（启动工作流） */
    boolean submitTrip(Long id);

    /** 取消出差申请 */
    boolean cancelTrip(Long id);
}
