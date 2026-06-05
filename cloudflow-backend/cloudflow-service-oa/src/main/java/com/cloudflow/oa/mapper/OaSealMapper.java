package com.cloudflow.oa.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.oa.domain.OaSeal;
import org.apache.ibatis.annotations.Mapper;

/**
 * 印章台账 Mapper。
 */
@Mapper
public interface OaSealMapper extends BaseMapper<OaSeal> {

    Integer getTodayApplicationMaxSeq();
}
