package com.cloudflow.oa.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.oa.domain.OaMessageRecord;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

@Mapper
public interface OaMessageRecordMapper extends BaseMapper<OaMessageRecord> {
    List<OaMessageRecord> selectRecentForUser(@Param("tenantId") Long tenantId,
                                              @Param("userId") Long userId,
                                              @Param("limit") int limit);
}
