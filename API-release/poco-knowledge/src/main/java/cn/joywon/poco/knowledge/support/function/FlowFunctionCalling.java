package cn.joywon.poco.knowledge.support.function;

import cn.hutool.core.collection.CollUtil;
import cn.hutool.core.lang.Dict;
import cn.hutool.core.util.StrUtil;
import com.fasterxml.jackson.annotation.JsonClassDescription;
import com.fasterxml.jackson.annotation.JsonInclude;
import cn.joywon.poco.common.core.util.R;
import cn.joywon.poco.common.security.service.PocoUser;
import cn.joywon.poco.flow.task.api.feign.RemoteFlowApiFlowService;
import cn.joywon.poco.flow.task.constant.NodeUserTypeEnum;
import cn.joywon.poco.flow.task.dto.ProcessInstanceParamDto;
import cn.joywon.poco.flow.task.vo.FormGroupVo;
import cn.joywon.poco.knowledge.dto.BaseAiRequest;
import cn.joywon.poco.knowledge.dto.ChatMessageDTO;
import cn.joywon.poco.knowledge.support.annotation.FieldPrompt;
import lombok.Data;
import lombok.EqualsAndHashCode;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

/**
 * @author poco
 * @date 2024/3/29
 * <p>
 * 流程新增函数
 */
@Component
@RequiredArgsConstructor
public class FlowFunctionCalling implements FunctionCalling<FlowRequest> {

	private final RemoteFlowApiFlowService flowService;

	/**
	 * 路由路径
	 * @return {@link String }
	 */
	@Override
	public String routePath() {
		return "/flow/task/started";
	}

	/**
	 * 显示名称
	 * @return {@link String }
	 */
	@Override
	public String showInfo() {
		return "请假助手，能根据您的描述帮您发起请求流程调用flowable。比如：明天帮我请一天假，好兄弟结婚";
	}

	/**
	 * 检查参数是否正确
	 * @param request
	 * @param extDetails
	 * @return
	 */
	@Override
	public R<String> checkParams(FlowRequest request, PocoUser userDetails, ChatMessageDTO.ExtDetails extDetails) {
		return R.ok();
	}

	/**
	 * 实际的数据源提供逻辑
	 * @param request the function argument username
	 * @param extDetails
	 * @return Response
	 */
	public R<String> handle(FlowRequest request, PocoUser user, ChatMessageDTO.ExtDetails extDetails) {

		R<List<FormGroupVo>> listR = flowService.listCurrentUserStartGroup();

		if (Objects.isNull(listR.getData())) {
			return R.failed("创建失败，权限不足");
		}

		String flowId = "";
		for (FormGroupVo formGroupVo : listR.getData()) {
			for (FormGroupVo.FlowVo item : formGroupVo.getItems()) {
				String name = item.getName();
				if (StrUtil.containsAnyIgnoreCase(request.getFlowName(), name)) {
					flowId = item.getFlowId();
				}
			}
		}

		if (StrUtil.isBlank(flowId)) {
			return R.failed("创建失败，流程不存在");
		}

		// 获取流程配置详情
		ProcessInstanceParamDto processInstanceParamDto = new ProcessInstanceParamDto();
		processInstanceParamDto.setFlowId(flowId);
		processInstanceParamDto.setStartUserId(String.valueOf(user.getId()));

		Map<String, Object> paramMap = new HashMap<>();
		// 设置发起人
		Dict rootUser = Dict.create()
			.set("id", processInstanceParamDto.getStartUserId())
			.set("name", user.getUsername())
			.set("type", NodeUserTypeEnum.USER.getKey());
		paramMap.put("root", CollUtil.newArrayList(rootUser));
		paramMap.put("days", request.getDays());
		paramMap.put("reason", request.getReason());
		paramMap.put("startDate", request.getStartDate());

		processInstanceParamDto.setParamMap(paramMap);

		flowService.startProcessInstance(processInstanceParamDto);
		return R.ok(StrUtil.format("流程发起成功，流程名称：{}", request.getFlowName()));
	}

}

@Data
@EqualsAndHashCode(callSuper = true)
@JsonInclude(JsonInclude.Include.NON_NULL)
@JsonClassDescription("流程信息")
class FlowRequest extends BaseAiRequest {

	@FieldPrompt("流程名称：请假流程")
	private String flowName;

	@FieldPrompt("原因：请假原因")
	private String reason;

	@FieldPrompt("天数：请假天数")
	private Integer days;

	@FieldPrompt("开始日期：请假开始日期，格式为 yyyy-MM-dd")
	private String startDate;

}
