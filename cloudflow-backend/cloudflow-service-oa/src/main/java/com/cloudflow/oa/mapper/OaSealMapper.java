package com.cloudflow.oa.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.oa.domain.OaSeal;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Select;

/**
 * 印章台账 Mapper。
 */
@Mapper
public interface OaSealMapper extends BaseMapper<OaSeal> {

    @Select("SELECT MAX(CAST(SUBSTRING(application_no, 11) AS UNSIGNED)) FROM oa_seal_application WHERE application_no LIKE CONCAT('YY', DATE_FORMAT(NOW(), '%Y%m%d'), '%')")
    Integer getTodayApplicationMaxSeq();
}
