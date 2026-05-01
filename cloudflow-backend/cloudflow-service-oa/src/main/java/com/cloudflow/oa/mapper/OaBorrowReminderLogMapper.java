package com.cloudflow.oa.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.oa.domain.OaBorrowReminderLog;
import org.apache.ibatis.annotations.Mapper;

/**
 * 借用逾期催还 Mapper。
 */
@Mapper
public interface OaBorrowReminderLogMapper extends BaseMapper<OaBorrowReminderLog> {
}
