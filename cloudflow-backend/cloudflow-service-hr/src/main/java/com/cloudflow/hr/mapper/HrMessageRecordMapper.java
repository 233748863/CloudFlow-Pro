package com.cloudflow.hr.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.hr.domain.entity.HrMessageRecord;
import org.apache.ibatis.annotations.Mapper;

/** 统一消息记录查询 Mapper。 */
@Mapper
public interface HrMessageRecordMapper extends BaseMapper<HrMessageRecord> {
}
