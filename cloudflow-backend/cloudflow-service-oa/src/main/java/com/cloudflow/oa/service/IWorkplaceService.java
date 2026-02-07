package com.cloudflow.oa.service;

import com.cloudflow.oa.domain.dto.WorkplaceSummaryDTO;
import com.cloudflow.oa.domain.dto.RecentTaskDTO;
import java.util.List;

/**
 * 工作台服务接口
 */
public interface IWorkplaceService {
    
    /**
     * 获取工作台概览
     * 聚合数据：待办任务数量、今日日程数量、未读消息数量
     * 
     * @param userId 用户ID
     * @return 工作台概览数据
     */
    WorkplaceSummaryDTO getWorkplaceSummary(Long userId);
    
    /**
     * 获取最近任务
     * 返回用户最近操作的任务列表
     * 
     * @param userId 用户ID
     * @param limit 返回数量限制
     * @return 最近任务列表
     */
    List<RecentTaskDTO> getRecentTasks(Long userId, Integer limit);
}
