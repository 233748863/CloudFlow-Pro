package com.cloudflow.hr.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.hr.domain.entity.EmployeeDocument;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

/**
 * 员工证件 Mapper
 */
@Mapper
public interface EmployeeDocumentMapper extends BaseMapper<EmployeeDocument> {

    /**
     * 按员工查询证件列表，显式列选择，避免主表误选附件字段。
     */
    List<EmployeeDocument> selectDocumentsByEmployeeId(@Param("tenantId") Long tenantId,
                                                       @Param("employeeId") Long employeeId);

    /**
     * 按主键查询证件详情，显式列选择。
     */
    EmployeeDocument selectDocumentById(@Param("tenantId") Long tenantId,
                                        @Param("id") Long id);
}
