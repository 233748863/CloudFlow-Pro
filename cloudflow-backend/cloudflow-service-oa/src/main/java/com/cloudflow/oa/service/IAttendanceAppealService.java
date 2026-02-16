package com.cloudflow.oa.service;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.service.IService;
import com.cloudflow.oa.domain.AttendanceAppeal;

/**
 * 补卡/外勤申请 Service 接口
 */
public interface IAttendanceAppealService extends IService<AttendanceAppeal> {

    /** 分页查询 */
    IPage<AttendanceAppeal> queryPage(AttendanceAppeal query, int pageNum, int pageSize);

    /** 生成申请单号 */
    String generateAppealNo();

    /** 创建申请 */
    boolean createAppeal(AttendanceAppeal appeal);

    /** 提交申请（启动工作流） */
    boolean submitAppeal(Long id);

    /** 取消申请 */
    boolean cancelAppeal(Long id);
}
