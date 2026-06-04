package com.cloudflow.oa.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.oa.domain.SysAnnouncement;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import java.util.List;
import java.util.Map;
import java.util.Set;

@Mapper
public interface SysAnnouncementMapper extends BaseMapper<SysAnnouncement> {
    
    /**
     * 查询我的公告列表 (自定义SQL以处理复杂的范围匹配和阅读状态)
     */
    List<SysAnnouncement> getMyAnnouncements(@Param("userId") Long userId, 
                                           @Param("deptId") String deptId, 
                                           @Param("roleIds") Set<String> roleIds);

    List<Map<String, Object>> selectExpectedReaders(@Param("tenantId") Long tenantId,
                                                    @Param("scopeType") String scopeType,
                                                    @Param("scopeValues") List<String> scopeValues);
}
