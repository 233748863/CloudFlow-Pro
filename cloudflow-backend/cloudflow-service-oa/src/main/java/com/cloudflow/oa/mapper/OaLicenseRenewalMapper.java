package com.cloudflow.oa.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.oa.domain.OaLicenseRenewal;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Select;

/**
 * 证照续期申请 Mapper。
 */
@Mapper
public interface OaLicenseRenewalMapper extends BaseMapper<OaLicenseRenewal> {

    @Select("SELECT MAX(CAST(SUBSTRING(renewal_no, 11) AS UNSIGNED)) FROM oa_license_renewal WHERE renewal_no LIKE CONCAT('XQ', DATE_FORMAT(NOW(), '%Y%m%d'), '%')")
    Integer getTodayRenewalMaxSeq();
}
