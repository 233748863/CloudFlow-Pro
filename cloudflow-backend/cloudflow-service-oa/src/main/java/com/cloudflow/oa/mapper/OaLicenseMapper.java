package com.cloudflow.oa.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.oa.domain.OaLicense;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Select;

/**
 * 证照台账 Mapper。
 */
@Mapper
public interface OaLicenseMapper extends BaseMapper<OaLicense> {

    @Select("SELECT MAX(CAST(SUBSTRING(borrow_no, 11) AS UNSIGNED)) FROM oa_license_borrow WHERE borrow_no LIKE CONCAT('ZZ', DATE_FORMAT(NOW(), '%Y%m%d'), '%')")
    Integer getTodayBorrowMaxSeq();
}
