package com.cloudflow.oa.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.oa.domain.OaSealRenewal;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Select;

/**
 * 印章续期申请 Mapper。
 */
@Mapper
public interface OaSealRenewalMapper extends BaseMapper<OaSealRenewal> {

    @Select("SELECT MAX(CAST(SUBSTRING(renewal_no, 11) AS UNSIGNED)) FROM oa_seal_renewal WHERE renewal_no LIKE CONCAT('YZ', DATE_FORMAT(NOW(), '%Y%m%d'), '%')")
    Integer getTodayRenewalMaxSeq();
}
