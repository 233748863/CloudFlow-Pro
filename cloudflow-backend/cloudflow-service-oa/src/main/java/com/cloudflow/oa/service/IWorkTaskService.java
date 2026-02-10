package com.cloudflow.oa.service;

import com.baomidou.mybatisplus.extension.service.IService;
import com.cloudflow.oa.domain.WorkTask;
import java.util.List;

/**
 * 协作任务 Service 接口
 */
public interface IWorkTaskService extends IService<WorkTask> {
    
    /**
     * 查询我的任务列表
     * @param userId 用户ID
     * @param status 状态 (可选)
     * @return 任务列表
     */
    List<WorkTask> getMyTasks(Long userId, String status);
    
    /**
     * 更新任务状态
     * @param taskId 任务ID
     * @param status 新状态
     * @return 是否成功
     */
    boolean updateStatus(Long taskId, String status);
}
