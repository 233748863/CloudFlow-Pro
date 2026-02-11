package cn.joywon.poco.flow.engine.service;

import cn.hutool.core.lang.Validator;
import cn.hutool.http.HttpRequest;
import cn.hutool.http.HttpResponse;
import cn.hutool.json.JSONUtil;
import cn.joywon.poco.common.core.util.RetOps;
import cn.joywon.poco.common.security.util.NonWebTokenContextHolder;
import cn.joywon.poco.flow.task.api.feign.RemoteFlowTaskService;
import cn.joywon.poco.flow.task.dto.ProcessNodeRecordAssignUserParamDto;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

/**
 * 节点任务完成通知处理
 *
 * @author poco
 * @date 2024/7/9
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class NodeTaskCompleteNotifyService {

    private final RemoteFlowTaskService remoteFlowTaskService;

    @Async
    public void sendNotify(String token, ProcessNodeRecordAssignUserParamDto taskCompleteParamDto) {
        NonWebTokenContextHolder.setToken(token);
        RetOps.of(remoteFlowTaskService.queryNodeOriData(taskCompleteParamDto.getFlowId(), taskCompleteParamDto.getNodeId()))
                .getData()
                .ifPresent(node -> {
                    if (Validator.isUrl(node.getEventConfig())) {
                        HttpResponse response = HttpRequest.post(node.getEventConfig())
                                .body(JSONUtil.toJsonStr(taskCompleteParamDto))
                                .timeout(10000)
                                .execute();
                        log.debug("节点任务完成通知处理完成:{}，数据：{}", response.getStatus(), taskCompleteParamDto);
                    }
                });
    }
}
