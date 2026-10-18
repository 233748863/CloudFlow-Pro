package com.cloudflow.auth.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.auth.domain.SysUser;
import com.cloudflow.auth.domain.vo.SysUserOptionVO;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import java.util.List;

@Mapper
public interface SysUserMapper extends BaseMapper<SysUser> {
    int recordLogin(@Param("userId") long userId, @Param("tenantId") long tenantId, @Param("version") int version,
            @Param("ip") String ip, @Param("time") java.time.LocalDateTime time);
    Page<SysUserOptionVO> selectUserOptions(Page<SysUserOptionVO> page, @Param("tenantId") Long tenantId);
    List<Long> selectHolidayReminderUserIds(@Param("tenantId") Long tenantId,
            @Param("afterUserId") long afterUserId, @Param("limit") int limit);
}
