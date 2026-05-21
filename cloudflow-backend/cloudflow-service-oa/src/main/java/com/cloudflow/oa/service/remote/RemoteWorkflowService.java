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
 * 注意：WorkflowController 类级别 @RequestMapping("/wf")，
 * 其他控制器走自身前缀（如 /enhance, /copy 等）。
 *
 * @author CloudFlow
 */
@FeignClient(
    name = "cloudflow-service-workflow",
    contextId = "oaRemoteWorkflowService",
    fallbackFactory = RemoteWorkflowFallbackFactory.class
)
public interface RemoteWorkflowService {

    @PostMapping("/wf/start")
    R<?> startProcess(@RequestBody WorkflowProcessStartDTO req);

    @PostMapping("/wf/complete")
    R<?> completeTask(@RequestBody WorkflowTaskCompleteDTO req);

    @PostMapping("/wf/recall")
    R<?> recallProcess(@RequestBody WorkflowRecallDTO req);

    @GetMapping("/wf/instance/{processInstanceId}")
    R<?> getProcessInstance(@PathVariable("processInstanceId") String processInstanceId);

    @GetMapping("/wf/tasks/count")
    R<Map<String, Integer>> getTasksCount();

    @GetMapping("/wf/tasks/statistics")
    R<Map<String, Object>> getTaskStatistics(
        @RequestParam(value = "userId", required = false) Long userId,
        @RequestParam(value = "startDate", required = false) String startDate,
        @RequestParam(value = "endDate", required = false) String endDate
    );

    @GetMapping("/wf/tasks/groups")
    R<Map<String, Object>> getTaskGroups(@RequestParam(value = "userId", required = false) Long userId);
}
