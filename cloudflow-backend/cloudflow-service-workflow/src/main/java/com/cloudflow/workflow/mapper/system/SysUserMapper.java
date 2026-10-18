package com.cloudflow.workflow.mapper.system;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.workflow.domain.system.SysUser;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import java.util.List;

@Mapper
public interface SysUserMapper extends BaseMapper<SysUser> {
    SysUser selectActiveForTaskTransfer(@Param("tenantId") Long tenantId, @Param("userId") Long userId);

    List<Long> selectTimerFailureAdminIds(@Param("tenantId") Long tenantId,
                                         @Param("afterUserId") long afterUserId,
                                         @Param("limit") int limit);
}
