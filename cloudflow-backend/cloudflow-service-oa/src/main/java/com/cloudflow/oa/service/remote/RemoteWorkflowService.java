package com.cloudflow.oa.service.remote;

import com.cloudflow.common.core.domain.R;
import com.cloudflow.oa.domain.dto.WorkflowProcessStartDTO;
import com.cloudflow.oa.domain.dto.WorkflowRecallDTO;
import com.cloudflow.oa.domain.dto.WorkflowTaskCompleteDTO;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * 远程调用工作流服务
 * 
 * 注意：工作流服务的 WorkflowController 没有类级别 @RequestMapping，
 * 方法路径即为最终路径（如 /start, /tasks/count, /todo 等）
 * 
 * @author CloudFlow
 */
@FeignClient(
    name = "cloudflow-service-workflow",
    fallbackFactory = RemoteWorkflowFallbackFactory.class
)
public interface RemoteWorkflowService {
    
    /**
     * 启动工作流实例
     * 对应 WorkflowController.startProcess()
     * 
     * @param req 启动请求参数，包含 processDefinitionKey, businessKey, variables 等
     * @return R 包含流程实例信息
     */
    @PostMapping("/start")
    R<?> startProcess(@RequestBody WorkflowProcessStartDTO req);
    
    /**
     * 完成任务
     * 对应 WorkflowController.completeTask()
     * 
     * @param req 完成任务请求参数
     */
    @PostMapping("/complete")
    R<?> completeTask(@RequestBody WorkflowTaskCompleteDTO req);

    /**
     * 撤回流程实例。
     */
    @PostMapping("/recall")
    R<?> recallProcess(@RequestBody WorkflowRecallDTO req);
    
    /**
     * 查询流程实例状态
     * 对应 WorkflowController.getProcessInstance()
     * 
     * @param processInstanceId 流程实例ID
     * @return 流程实例信息
     */
    @GetMapping("/instance/{processInstanceId}")
    R<?> getProcessInstance(@PathVariable("processInstanceId") String processInstanceId);
    
    /**
     * 获取待办任务数量统计
     * 对应 WorkflowController.getTasksCount()
     * 
     * @return 包含 todo, doing 等数量的 Map
     */
    @GetMapping("/tasks/count")
    R<Map<String, Integer>> getTasksCount();
    
    /**
     * 获取任务统计信息（按用户）
     * 对应 WorkflowController.getTaskStatistics()
     * 
     * @param userId 用户ID
     * @param startDate 开始日期
     * @param endDate 结束日期
     * @return 任务统计数据
     */
    @GetMapping("/tasks/statistics")
    R<Map<String, Object>> getTaskStatistics(
        @RequestParam(value = "userId", required = false) Long userId,
        @RequestParam(value = "startDate", required = false) String startDate,
        @RequestParam(value = "endDate", required = false) String endDate
    );
    
    /**
     * 获取任务分组信息
     * 对应 WorkflowController.getTaskGroups()
     * 
     * @param userId 用户ID
     * @return 任务分组数据
     */
    @GetMapping("/tasks/groups")
    R<Map<String, Object>> getTaskGroups(@RequestParam(value = "userId", required = false) Long userId);
}
