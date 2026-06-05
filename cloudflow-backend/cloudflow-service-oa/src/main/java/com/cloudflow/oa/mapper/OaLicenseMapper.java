package com.cloudflow.oa.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.oa.domain.OaLicense;
import org.apache.ibatis.annotations.Mapper;

/**
 * 证照台账 Mapper。
 */
@Mapper
public interface OaLicenseMapper extends BaseMapper<OaLicense> {

    Integer getTodayBorrowMaxSeq();
}
