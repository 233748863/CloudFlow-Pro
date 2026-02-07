package com.cloudflow.workflow.service.remote;

import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * 远程调用OA服务
 * 
 * @author CloudFlow
 */
@FeignClient(
    name = "cloudflow-oa",
    fallbackFactory = RemoteOaFallbackFactory.class
)
public interface RemoteOaService {
    
    /**
     * 获取任务详情
     * 
     * @param taskId 任务ID
     * @return 任务详情
     */
    @GetMapping("/oa/task/{taskId}")
    Map<String, Object> getTaskDetail(@PathVariable("taskId") Long taskId);
    
    /**
     * 更新任务状态
     * 
     * @param taskId 任务ID
     * @param status 状态
     */
    @PutMapping("/oa/task/{taskId}/status")
    void updateTaskStatus(
        @PathVariable("taskId") Long taskId,
        @RequestParam("status") String status
    );
    
    /**
     * 获取公告详情
     * 
     * @param announcementId 公告ID
     * @return 公告详情
     */
    @GetMapping("/oa/announcement/{announcementId}")
    Map<String, Object> getAnnouncementDetail(@PathVariable("announcementId") Long announcementId);
    
    /**
     * 获取车辆使用记录
     * 
     * @param vehicleId 车辆ID
     * @return 使用记录列表
     */
    @GetMapping("/oa/vehicle/{vehicleId}/usage")
    Object getVehicleUsageRecords(@PathVariable("vehicleId") Long vehicleId);
}
