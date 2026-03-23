package com.cloudflow.hr.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.hr.domain.entity.EmergencyContact;
import org.apache.ibatis.annotations.Mapper;

/**
 * 紧急联系人Mapper接口
 * 
 * @author CloudFlow
 * @date 2026-03-20
 */
@Mapper
public interface EmergencyContactMapper extends BaseMapper<EmergencyContact> {
}
