package com.cloudflow.workflow.service.remote;

import lombok.extern.slf4j.Slf4j;
import org.springframework.cloud.openfeign.FallbackFactory;
import org.springframework.stereotype.Component;

import java.util.HashMap;
import java.util.Map;

/**
 * 远程OA服务降级处理
 * 
 * @author CloudFlow
 */
@Slf4j
@Component
public class RemoteOaFallbackFactory implements FallbackFactory<RemoteOaService> {
    
    @Override
    public RemoteOaService create(Throwable cause) {
        log.error("OA服务调用失败: {}", cause.getMessage());
        
        return new RemoteOaService() {
            @Override
            public Map<String, Object> getTaskDetail(Long taskId) {
                log.error("获取任务详情失败，任务ID: {}", taskId);
                Map<String, Object> result = new HashMap<>();
                result.put("error", "OA服务暂时不可用");
                return result;
            }
            
            @Override
            public void updateTaskStatus(Long taskId, String status) {
                log.error("更新任务状态失败，任务ID: {}, 状态: {}", taskId, status);
                throw new RuntimeException("OA服务暂时不可用，请稍后重试");
            }
            
            @Override
            public Map<String, Object> getAnnouncementDetail(Long announcementId) {
                log.error("获取公告详情失败，公告ID: {}", announcementId);
                Map<String, Object> result = new HashMap<>();
                result.put("error", "OA服务暂时不可用");
                return result;
            }
            
            @Override
            public Object getVehicleUsageRecords(Long vehicleId) {
                log.error("获取车辆使用记录失败，车辆ID: {}", vehicleId);
                return new HashMap<String, Object>() {{
                    put("error", "OA服务暂时不可用");
                }};
            }
        };
    }
}
