package com.cloudflow.hr.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cloudflow.common.core.security.UserDeletionGuard;
import com.cloudflow.hr.domain.entity.HrEmployee;
import com.cloudflow.hr.mapper.HrEmployeeMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;

@Component
@RequiredArgsConstructor
public class HrUserDeletionGuard implements UserDeletionGuard {

    private final HrEmployeeMapper hrEmployeeMapper;

    @Override
    public List<String> findBlockingReferences(Long userId) {
        List<String> result = new ArrayList<>();
        Long count = hrEmployeeMapper.selectCount(new LambdaQueryWrapper<HrEmployee>()
                .eq(HrEmployee::getUserId, userId));
        if (count != null && count > 0) {
            result.add("HR员工档案 " + count + " 条");
        }
        return result;
    }
}
