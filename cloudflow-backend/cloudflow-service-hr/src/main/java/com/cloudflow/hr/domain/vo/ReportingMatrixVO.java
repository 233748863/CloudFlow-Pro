package com.cloudflow.hr.domain.vo;

import lombok.Data;

import java.util.List;

/**
 * 汇报关系矩阵VO
 * 
 * @author CloudFlow
 * @since 2026-03-20
 */
@Data
public class ReportingMatrixVO {

    /**
     * 部门ID
     */
    private Long deptId;

    /**
     * 部门名称
     */
    private String deptName;

    /**
     * 汇报关系列表
     */
    private List<ReportingLineVO> reportingLines;

    /**
     * 员工汇报关系节点
     */
    @Data
    public static class EmployeeNode {
        /**
         * 员工ID
         */
        private Long employeeId;

        /**
         * 员工姓名
         */
        private String employeeName;

        /**
         * 员工工号
         */
        private String employeeNo;

        /**
         * 直接汇报人
         */
        private EmployeeNode directReportTo;

        /**
         * 虚线汇报人列表
         */
        private List<EmployeeNode> dottedReportToList;

        /**
         * 直接下属列表
         */
        private List<EmployeeNode> directReports;
    }

    /**
     * 部门汇报关系树
     */
    private List<EmployeeNode> reportingTree;
}
