package com.cloudflow.oa.service.remote;

import com.cloudflow.common.core.domain.R;
import lombok.extern.slf4j.Slf4j;
import org.springframework.cloud.openfeign.FallbackFactory;
import org.springframework.stereotype.Component;

import java.util.HashMap;
import java.util.Map;

/**
 * 远程工作流服务降级处理
 * 当工作流服务不可用时，提供降级响应
 * 
 * @author CloudFlow
 */
@Slf4j
@Component
public class RemoteWorkflowFallbackFactory implements FallbackFactory<RemoteWorkflowService> {
    
    @Override
    public RemoteWorkflowService create(Throwable cause) {
        log.error("工作流服务调用失败: {}", cause.getMessage());
        
        return new RemoteWorkflowService() {
            @Override
            public R<?> startProcess(Map<String, Object> req) {
                log.error("启动工作流失败，请求参数: {}", req);
                return R.fail("工作流服务暂时不可用，请稍后重试");
            }
            
            @Override
            public R<?> completeTask(Map<String, Object> req) {
                log.error("完成任务失败，请求参数: {}", req);
                return R.fail("工作流服务暂时不可用，请稍后重试");
            }
            
            @Override
            public R<?> getProcessInstance(String processInstanceId) {
                log.error("查询流程实例失败，流程实例ID: {}", processInstanceId);
                return R.fail("工作流服务暂时不可用");
            }
            
            @Override
            public R<Map<String, Integer>> getTasksCount() {
                log.warn("获取待办任务数量失败，返回默认值0");
                // 降级时返回空统计，不影响工作台展示
                Map<String, Integer> defaultCount = new HashMap<>();
                defaultCount.put("todo", 0);
                defaultCount.put("doing", 0);
                return R.ok(defaultCount);
            }
            
            @Override
            public R<Map<String, Object>> getTaskStatistics(Long userId, String startDate, String endDate) {
                log.warn("获取任务统计失败，用户ID: {}", userId);
                return R.ok(new HashMap<>());
            }
            
            @Override
            public R<Map<String, Object>> getTaskGroups(Long userId) {
                log.warn("获取任务分组失败，用户ID: {}", userId);
                return R.ok(new HashMap<>());
            }
        };
    }
}
