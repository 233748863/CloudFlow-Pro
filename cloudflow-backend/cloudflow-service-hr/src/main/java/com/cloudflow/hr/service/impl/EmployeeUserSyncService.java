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
            throw new HrBusinessException("LINKED_USER_NOT_FOUND", "Linked system user does not exist");
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
            throw new HrBusinessException("LINKED_USER_ALREADY_BOUND", "Linked system user is already bound to another HR employee");
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
                        "Failed to sync linked system user: " + (result == null ? "Auth service did not respond" : result.getMsg()));
            }
        } catch (HrBusinessException e) {
            throw e;
        } catch (Exception e) {
            log.error("Failed to sync linked user, employeeId={}, userId={}", employee.getId(), employee.getUserId(), e);
            throw new HrBusinessException("LINKED_USER_SYNC_FAILED", "Failed to sync linked system user: " + e.getMessage(), e);
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
            log.error("Failed to disable linked user, employeeId={}, userId={}", employee.getId(), employee.getUserId(), e);
            throw HrBusinessException.employeeLinkedUserDisableFailed(employee.getId(), employee.getUserId());
        }
    }

    private UserVO getExistingUser(Long userId) {
        try {
            R<UserVO> result = authServiceClient.getUserById(userId);
            if (result == null || !result.isSuccess() || result.getData() == null) {
                throw new HrBusinessException("LINKED_USER_NOT_FOUND",
                        "Linked system user does not exist: " + (result == null ? "Auth service did not respond" : result.getMsg()));
            }
            return result.getData();
        } catch (HrBusinessException e) {
            throw e;
        } catch (Exception e) {
            log.error("Failed to validate linked user, userId={}", userId, e);
            throw new HrBusinessException("LINKED_USER_VALIDATE_FAILED", "Failed to validate linked system user: " + e.getMessage(), e);
        }
    }

    private String buildNickName(Employee employee) {
        String nickName = StringUtils.hasText(employee.getName()) ? employee.getName().trim() : employee.getEmployeeNo();
        if (!StringUtils.hasText(nickName)) {
            return "employee";
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
