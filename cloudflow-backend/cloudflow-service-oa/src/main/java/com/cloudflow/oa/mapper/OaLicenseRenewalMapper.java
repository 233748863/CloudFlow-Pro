package com.cloudflow.oa.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.oa.domain.OaLicenseRenewal;
import org.apache.ibatis.annotations.Mapper;

/**
 * 证照续期申请 Mapper。
 */
@Mapper
public interface OaLicenseRenewalMapper extends BaseMapper<OaLicenseRenewal> {

    Integer getTodayRenewalMaxSeq();
}
