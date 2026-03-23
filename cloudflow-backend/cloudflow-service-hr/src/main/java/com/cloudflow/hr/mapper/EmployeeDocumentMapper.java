package com.cloudflow.hr.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.hr.domain.entity.EmployeeDocument;
import org.apache.ibatis.annotations.Mapper;

/**
 * 员工证件Mapper接口
 * 
 * @author CloudFlow
 * @date 2026-03-20
 */
@Mapper
public interface EmployeeDocumentMapper extends BaseMapper<EmployeeDocument> {
}
