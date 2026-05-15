package com.cloudflow.auth.controller.system;

import cn.dev33.satoken.annotation.SaCheckPermission;
import com.cloudflow.auth.domain.dto.OnlineUserDTO;
import com.cloudflow.auth.domain.dto.OnlineUserQuery;
import com.cloudflow.auth.service.OnlineUserService;
import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.domain.R;
import lombok.RequiredArgsConstructor;
import org.springframework.util.CollectionUtils;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * 在线用户管理控制器。
 */
@RestController
@RequestMapping("/system/online")
@RequiredArgsConstructor
public class SysOnlineUserController {

    private final OnlineUserService onlineUserService;

    /**
     * 分页查询在线用户。
     */
    @GetMapping("/page")
    @SaCheckPermission("system:online:list")
    public R<PageResult<OnlineUserDTO>> page(OnlineUserQuery query, PageQuery pageQuery) {
        return R.ok(onlineUserService.selectOnlineUserPage(query, pageQuery));
    }

    /**
     * 批量强制下线。
     */
    @DeleteMapping
    @SaCheckPermission("system:online:forceLogout")
    public R<String> forceLogout(@RequestBody List<String> tokens) {
        if (CollectionUtils.isEmpty(tokens)) {
            return R.fail("请选择要下线的在线用户");
        }

        int count = onlineUserService.forceLogout(tokens);
        if (count <= 0) {
            return R.fail("没有可下线的在线用户");
        }
        return R.ok("成功强制下线 " + count + " 个会话");
    }
}
