package cn.joywon.poco.flow.task.api.feign;

import cn.joywon.poco.common.core.constant.ServiceNameConstants;
import cn.joywon.poco.common.core.util.R;
import cn.joywon.poco.flow.task.dto.ProcessInstanceParamDto;
import cn.joywon.poco.flow.task.vo.FormGroupVo;
import cn.joywon.poco.flow.task.vo.ProcessVO;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;

import java.util.List;

/**
 * @author poco
 * @date 2023/7/14
 */
@FeignClient(contextId = "remoteFlowApiFlowService", value = ServiceNameConstants.FLOW_TASK_SERVER)
public interface RemoteFlowApiFlowService {

    /**
     * 查询所有我可以发起的表单
     *
     * @return R
     */
    @GetMapping("/combination/group/listCurrentUserStartGroup")
    R<List<FormGroupVo>> listCurrentUserStartGroup();

    /**
     * 获取流程详情
     *
     * @param flowId 流程id
     * @return R
     */
    @GetMapping("/process/getDetail")
    R<ProcessVO> getDetail(@RequestParam("flowId") String flowId);


    /**
     * 启动流程实例
     *
     * @param paramDto param dto
     * @return {@link R } 流程实例ID {@link String}
     */
    @PostMapping("/process-instance/startProcessInstance")
    R<String> startProcessInstance(@RequestBody ProcessInstanceParamDto paramDto);

}
