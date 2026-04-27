package com.cloudflow.hr.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.hr.client.AuthServiceClient;
import com.cloudflow.hr.client.dto.UserUpdateDTO;
import com.cloudflow.hr.client.vo.UserVO;
import com.cloudflow.hr.domain.entity.Employee;
import com.cloudflow.hr.exception.HrBusinessException;
import com.cloudflow.hr.mapper.EmployeeMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.util.Collections;

/**
 * Keeps the HR employee profile and the Auth login account consistent.
 *
 * sys_user remains the login/permission subject, while hr_employee remains the HR subject.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class EmployeeUserSyncService {

    private static final int SYS_USER_NICK_NAME_MAX_LENGTH = 30;

    private final EmployeeMapper employeeMapper;
    private final AuthServiceClient authServiceClient;

    public void validateUserBindable(Long tenantId, Long userId, Long currentEmployeeId) {
        if (userId == null) {
            return;
        }

        UserVO user = getExistingUser(userId);
        if (user.getUserId() == null || !userId.equals(user.getUserId())) {
            throw new HrBusinessException("LINKED_USER_NOT_FOUND", "关联的系统用户不存在");
        }

        ensureUserNotLinked(tenantId, userId, currentEmployeeId);
    }

    public void ensureUserNotLinked(Long tenantId, Long userId, Long currentEmployeeId) {
        if (userId == null) {
            return;
        }

        LambdaQueryWrapper<Employee> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(Employee::getTenantId, tenantId)
                .eq(Employee::getUserId, userId);
        if (currentEmployeeId != null) {
            wrapper.ne(Employee::getId, currentEmployeeId);
        }

        Long count = employeeMapper.selectCount(wrapper);
        if (count != null && count > 0) {
            throw new HrBusinessException("LINKED_USER_ALREADY_BOUND", "该系统用户已绑定其他 HR 员工档案");
        }
    }

    public void syncLinkedUser(Employee employee) {
        if (employee == null || employee.getUserId() == null) {
            return;
        }

        UserUpdateDTO dto = new UserUpdateDTO();
        dto.setDeptId(employee.getDeptId());
        dto.setForceDeptSync(true);
        dto.setNickName(buildNickName(employee));
        dto.setEmail(employee.getEmail() == null ? "" : employee.getEmail());
        dto.setPhonenumber(employee.getPhone() == null ? "" : employee.getPhone());
        dto.setSex(resolveUserSex(employee.getGender()));
        dto.setStatus("RESIGNED".equals(employee.getEmployeeStatus()) ? 1 : 0);
        dto.setPostIds(employee.getPostId() == null ? Collections.emptyList() : Collections.singletonList(employee.getPostId()));

        try {
            R<Void> result = authServiceClient.updateUser(employee.getUserId(), dto);
            if (result == null || !result.isSuccess()) {
                throw new HrBusinessException("LINKED_USER_SYNC_FAILED",
                        "同步关联系统用户失败：" + (result == null ? "Auth 服务无响应" : result.getMsg()));
            }
        } catch (HrBusinessException e) {
            throw e;
        } catch (Exception e) {
            log.error("同步关联系统用户失败，员工ID：{}，用户ID：{}", employee.getId(), employee.getUserId(), e);
            throw new HrBusinessException("LINKED_USER_SYNC_FAILED", "同步关联系统用户失败：" + e.getMessage(), e);
        }
    }

    public void disableLinkedUser(Employee employee) {
        if (employee == null || employee.getUserId() == null) {
            return;
        }

        try {
            R<Void> result = authServiceClient.disableUser(employee.getUserId());
            if (result == null || !result.isSuccess()) {
                throw HrBusinessException.employeeLinkedUserDisableFailed(employee.getId(), employee.getUserId());
            }
        } catch (HrBusinessException e) {
            throw e;
        } catch (Exception e) {
            log.error("禁用员工关联 Auth 用户失败，员工ID：{}，用户ID：{}", employee.getId(), employee.getUserId(), e);
            throw HrBusinessException.employeeLinkedUserDisableFailed(employee.getId(), employee.getUserId());
        }
    }

    private UserVO getExistingUser(Long userId) {
        try {
            R<UserVO> result = authServiceClient.getUserById(userId);
            if (result == null || !result.isSuccess() || result.getData() == null) {
                throw new HrBusinessException("LINKED_USER_NOT_FOUND",
                        "关联的系统用户不存在：" + (result == null ? "Auth 服务无响应" : result.getMsg()));
            }
            return result.getData();
        } catch (HrBusinessException e) {
            throw e;
        } catch (Exception e) {
            log.error("校验关联系统用户失败，用户ID：{}", userId, e);
            throw new HrBusinessException("LINKED_USER_VALIDATE_FAILED", "校验关联系统用户失败：" + e.getMessage(), e);
        }
    }

    private String buildNickName(Employee employee) {
        String nickName = StringUtils.hasText(employee.getName()) ? employee.getName().trim() : employee.getEmployeeNo();
        if (!StringUtils.hasText(nickName)) {
            return "员工";
        }
        return nickName.length() <= SYS_USER_NICK_NAME_MAX_LENGTH
                ? nickName
                : nickName.substring(0, SYS_USER_NICK_NAME_MAX_LENGTH);
    }

    private String resolveUserSex(String gender) {
        if (!StringUtils.hasText(gender)) {
            return "2";
        }
        String normalized = gender.trim().toUpperCase();
        if ("MALE".equals(normalized)) {
            return "0";
        }
        if ("FEMALE".equals(normalized)) {
            return "1";
        }
        return "2";
    }
}
