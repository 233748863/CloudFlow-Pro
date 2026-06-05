package com.cloudflow.oa.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.oa.domain.OaSealRenewal;
import org.apache.ibatis.annotations.Mapper;

/**
 * 印章续期申请 Mapper。
 */
@Mapper
public interface OaSealRenewalMapper extends BaseMapper<OaSealRenewal> {

    Integer getTodayRenewalMaxSeq();
}
