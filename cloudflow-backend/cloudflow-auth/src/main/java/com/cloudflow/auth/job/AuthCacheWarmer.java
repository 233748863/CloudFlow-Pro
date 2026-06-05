package com.cloudflow.auth.job;

import com.cloudflow.auth.domain.SysRole;
import com.cloudflow.auth.domain.SysUser;
import com.cloudflow.auth.service.ISysDictTypeService;
import com.cloudflow.auth.service.ISysMenuService;
import com.cloudflow.auth.service.ISysRoleService;
import com.cloudflow.auth.service.ISysUserService;
import com.cloudflow.common.core.context.UserContext;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.util.List;

@Slf4j
@Component
@RequiredArgsConstructor
public class AuthCacheWarmer implements ApplicationRunner {

    private static final List<String> CORE_DICT_TYPES = List.of(
            "sys_normal_disable",
            "sys_user_sex",
            "sys_show_hide",
            "sys_yes_no",
            "sys_notice_type",
            "oa_approval_status",
            "oa_expense_type",
            "crm_lead_status",
            "workflow_status",
            "workflow_definition_status",
            "hr_leave_type",
            "hr_overtime_type"
    );

    private final ISysDictTypeService dictTypeService;
    private final ISysRoleService roleService;
    private final ISysMenuService menuService;
    private final ISysUserService userService;

    @Override
    public void run(ApplicationArguments args) {
        try {
            warmDictionaries();
            warmRoleMenus();
            warmUserMenusAndInfo();
        } catch (Exception e) {
            log.warn("auth cache warmup failed, startup continues", e);
        }
    }

    private void warmDictionaries() {
        for (String dictType : CORE_DICT_TYPES) {
            try {
                dictTypeService.selectDictDataByType(dictType);
            } catch (Exception e) {
                log.warn("cache warm dict failed, dictType={}", dictType, e);
            }
        }
    }

    private void warmRoleMenus() {
        List<SysRole> roles = roleService.selectRoleList(new SysRole());
        for (SysRole role : roles) {
            if (role.getRoleId() == null) {
                continue;
            }
            runAsTenant(role.getTenantId(), () -> {
                menuService.findMenuByRoleId(role.getRoleId());
                menuService.findPermsByRoleId(role.getRoleId());
            });
        }
        log.info("auth cache warm role menu completed, roleCount={}", roles.size());
    }

    private void warmUserMenusAndInfo() {
        List<SysUser> users = userService.selectUserList(new SysUser());
        for (SysUser user : users) {
            if (user.getUserId() == null) {
                continue;
            }
            runAsTenant(user.getTenantId(), () -> {
                menuService.selectMenuTreeByUserId(user.getUserId());
                if (StringUtils.hasText(user.getUserName())) {
                    userService.findUserInfo(user.getUserName(), user.getTenantId());
                }
            });
        }
        log.info("auth cache warm user menu completed, userCount={}", users.size());
    }

    private void runAsTenant(Long tenantId, Runnable task) {
        Long previousTenantId = UserContext.getTenantId();
        try {
            UserContext.setTenantId(tenantId);
            task.run();
        } catch (Exception e) {
            log.warn("auth cache warm item failed, tenantId={}", tenantId, e);
        } finally {
            UserContext.setTenantId(previousTenantId);
        }
    }
}
