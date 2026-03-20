package com.cloudflow.hr.service;

import com.cloudflow.hr.domain.dto.ReportingLineSetDTO;
import com.cloudflow.hr.domain.vo.ReportingLineVO;
import com.cloudflow.hr.domain.vo.ReportingMatrixVO;

import java.util.List;

/**
 * 汇报关系服务接口
 * 
 * @author CloudFlow
 * @since 2026-03-20
 */
public interface ReportingLineService {

    /**
     * 设置汇报关系
     * 
     * @param dto 汇报关系设置DTO
     */
    void setReportingLine(ReportingLineSetDTO dto);

    /**
     * 获取员工的汇报关系列表
     * 
     * @param employeeId 员工ID
     * @return 汇报关系列表
     */
    List<ReportingLineVO> getReportingLines(Long employeeId);

    /**
     * 获取部门汇报关系矩阵
     * 
     * @param deptId 部门ID
     * @return 汇报关系矩阵
     */
    ReportingMatrixVO getReportingMatrix(Long deptId);

    /**
     * 删除汇报关系
     * 
     * @param id 汇报关系ID
     */
    void deleteReportingLine(Long id);
}
