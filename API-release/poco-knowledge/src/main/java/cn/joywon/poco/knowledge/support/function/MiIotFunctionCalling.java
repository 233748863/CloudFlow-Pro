package cn.joywon.poco.knowledge.support.function;

import cn.hutool.core.util.StrUtil;
import cn.joywon.poco.common.core.util.R;
import cn.joywon.poco.common.security.service.PocoUser;
import cn.joywon.poco.knowledge.config.properties.AiKnowledgeProperties;
import cn.joywon.poco.knowledge.dto.BaseAiRequest;
import cn.joywon.poco.knowledge.dto.ChatMessageDTO;
import cn.joywon.poco.knowledge.dto.MiIotServiceDTO;
import cn.joywon.poco.knowledge.service.MiIotHomeAssistantService;
import cn.joywon.poco.knowledge.support.annotation.FieldPrompt;
import cn.joywon.poco.knowledge.support.constant.MiIotServiceEnums;
import lombok.Data;
import lombok.EqualsAndHashCode;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

/**
 * 米家设备控制 function calling
 *
 * @author poco
 * @date 2024/12/21
 */
@Component
@RequiredArgsConstructor
public class MiIotFunctionCalling implements FunctionCalling<MiIotRequest> {

	private final MiIotHomeAssistantService homeAssistantService;

	private final AiKnowledgeProperties aiKnowledgeProperties;

	/**
	 * 显示名称
	 * @return {@link String }
	 */
	@Override
	public String showInfo() {
		return "智能家居，能根据您的描述帮您控制米家设备。比如：天黑了";
	}

	/**
	 * 检查参数是否正确
	 * @param miIotRequest 请求信息
	 * @param userDetails 用户信息
	 * @param extDetails
	 * @return
	 */
	@Override
	public R checkParams(MiIotRequest miIotRequest, PocoUser userDetails, ChatMessageDTO.ExtDetails extDetails) {
		return R.ok();
	}

	/**
	 * 业务处理逻辑
	 * @param miIotRequest t
	 * @param userDetails 用户详细信息
	 * @param extDetails ext 详细信息
	 * @return {@link R }<{@link String }>
	 */
	@Override
	public R<String> handle(MiIotRequest miIotRequest, PocoUser userDetails, ChatMessageDTO.ExtDetails extDetails) {
		if (!aiKnowledgeProperties.getMiIot().isEnabled()) {
			return R.failed(StrUtil.format("未链接米家设备控制，无法执行 {}", miIotRequest.getIsOpen()));
		}

		for (String entityId : aiKnowledgeProperties.getMiIot().getEntityIdList()) {
			MiIotServiceEnums serviceEnum = MiIotServiceEnums.getEnumByCode(miIotRequest.getIsOpen());
			homeAssistantService.services(serviceEnum.getDomain(), serviceEnum.getService(),
					MiIotServiceDTO.IotRequest.builder().entityId(entityId).build());
		}
		return R.ok("设备控制成功");
	}

}

@Data
@EqualsAndHashCode(callSuper = true)
class MiIotRequest extends BaseAiRequest {

	@FieldPrompt("是否开启，0关闭 ，1开启")
	private int isOpen;

}
