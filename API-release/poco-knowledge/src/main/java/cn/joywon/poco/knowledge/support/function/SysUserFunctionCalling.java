package cn.joywon.poco.knowledge.support.function;

import cn.hutool.core.lang.Validator;
import cn.hutool.core.util.StrUtil;
import cn.joywon.poco.admin.api.dto.UserDTO;
import cn.joywon.poco.admin.api.feign.RemoteUserService;
import cn.joywon.poco.common.core.util.R;
import cn.joywon.poco.common.security.service.PocoUser;
import cn.joywon.poco.knowledge.dto.AiMessageResultDTO;
import cn.joywon.poco.knowledge.dto.BaseAiRequest;
import cn.joywon.poco.knowledge.dto.ChatMessageDTO;
import cn.joywon.poco.knowledge.support.annotation.FieldPrompt;
import dev.langchain4j.agent.tool.ToolExecutionRequest;
import lombok.Data;
import lombok.EqualsAndHashCode;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

/**
 * @author poco
 * @date 2024/3/29
 * <p>
 * 用户新增函数
 */
@Component
@RequiredArgsConstructor
public class SysUserFunctionCalling implements FunctionCalling<SysUserRequest> {

	private final RemoteUserService remoteUserService;

	/**
	 * 路由路径,点击文案会跳转至此页面
	 * @return {@link String }
	 */
	@Override
	public String routePath() {
		return "/admin/system/user/index";
	}

	/**
	 * 显示名称
	 * @return {@link String }
	 */
	@Override
	public String showInfo() {
		return "系统助手，能根据您的描述帮您创建用户。比如：帮我创建一个系统用户， 用户名 tom 密码123456 手机号 12312312312";
	}

	/**
	 * 检查参数是否正确
	 * @param request
	 * @param extDetails
	 * @return
	 */
	@Override
	public R<String> checkParams(SysUserRequest request, PocoUser userDetails, ChatMessageDTO.ExtDetails extDetails) {
		if (userDetails.getAuthorities().stream().noneMatch(e -> e.getAuthority().equals("sys_user_add"))) {
			return R.failed("创建失败，权限不足");
		}

		if (Validator.hasChinese(request.getUsername())) {
			return R.failed("创建失败，用户名格式为小写英文");
		}

		if (!Validator.isMobile(request.getPhone())) {
			return R.failed("创建失败，用户手机号格式不正确");
		}

		if (StrUtil.isBlank(request.getPassword())) {
			return R.failed("创建失败，用户密码格式不正确");
		}

		return R.ok();
	}

	/**
	 * 实际的数据源提供逻辑，根据用户输入 username 查询本地数据库，返回给大模型
	 * @param request the function argument username
	 * @param userDetails
	 * @param extDetails
	 * @return Response
	 */
	public R<String> handle(SysUserRequest request, PocoUser userDetails, ChatMessageDTO.ExtDetails extDetails) {
		UserDTO userDTO = new UserDTO();
		userDTO.setUsername(request.getUsername());
		userDTO.setPhone(request.getPhone());
		userDTO.setPassword(request.getPassword());
		R<Boolean> booleanR = remoteUserService.registerUser(userDTO);
		if (!booleanR.isOk()) {
			return R.failed(booleanR.getMsg());
		}
		return R.ok(StrUtil.format("{} 创建用户成功 ，请访问 【系统管理】> 【用户管理】 确认数据", request.getUsername()));
	}

}

@Data
@EqualsAndHashCode(callSuper = true)
class SysUserRequest extends BaseAiRequest {

	@FieldPrompt("用户名")
	private String username;

	@FieldPrompt("手机号")
	private String phone;

	@FieldPrompt("密码")
	private String password;

}
