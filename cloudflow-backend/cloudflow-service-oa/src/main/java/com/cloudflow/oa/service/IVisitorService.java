package com.cloudflow.oa.service;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.service.IService;
import com.cloudflow.oa.domain.Visitor;

import java.io.OutputStream;

/**
 * 访客管理 Service 接口
 */
public interface IVisitorService extends IService<Visitor> {

    /** 分页查询 */
    IPage<Visitor> queryPage(Visitor query, int pageNum, int pageSize);

    /** 新增访客预约并按租户配置决定是否启动审批 */
    boolean createVisitor(Visitor visitor);

    /** 修改访客预约，服务端重新校验被访者并保护流程字段 */
    boolean updateVisitor(Visitor visitor);

    /** 确认访客预约 */
    boolean confirmVisitor(Long visitorId);

    /** 访客签到（到达） */
    boolean checkInVisitor(Long visitorId);

    /** 访客签退（离开） */
    boolean checkOutVisitor(Long visitorId);

    /** 取消访客预约 */
    boolean cancelVisitor(Long visitorId);

    /** 回写访客审批结果 */
    void handleWorkflowResult(Long visitorId, String processInstanceId, boolean approved);

    /** 生成访客通行二维码 */
    void generateQrCode(Long visitorId, OutputStream outputStream);

    /** 生成通行证编号 */
    String generatePassCode();
}
