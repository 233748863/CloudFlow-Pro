package com.cloudflow.hr.domain.vo.employee;

import com.fasterxml.jackson.annotation.JsonFormat;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * HR 员工详情 VO（剔除 deleted/tenantId 内部字段；phone/email 由 HrTypedCrudService.maskRow 按权限掩码）。
 */
@Data
@Schema(name = "HrEmployeeVO", description = "HR 员工详情 VO")
public class HrEmployeeVO {

    @Schema(description = "员工 ID")
    private Long id;

    @Schema(description = "工号")
    private String employeeNo;

    @Schema(description = "姓名")
    private String name;

    @Schema(description = "性别")
    private String gender;

    @Schema(description = "出生日期")
    private LocalDate birthDate;

    @Schema(description = "手机号（按权限掩码，例如 138****1234）")
    private String phone;

    @Schema(description = "邮箱（按权限掩码）")
    private String email;

    @Schema(description = "部门 ID")
    private Long deptId;

    @Schema(description = "部门名称")
    private String deptName;

    @Schema(description = "岗位 ID")
    private Long postId;

    @Schema(description = "岗位名称")
    private String postName;

    @Schema(description = "职位 ID")
    private Long positionId;

    @Schema(description = "职位名称")
    private String positionName;

    @Schema(description = "员工类型")
    private String employeeType;

    @Schema(description = "员工状态：ACTIVE/ON_LEAVE/LEFT 等")
    private String employeeStatus;

    @Schema(description = "入职日期")
    private LocalDate hireDate;

    @Schema(description = "转正日期")
    private LocalDate regularDate;

    @Schema(description = "离职日期")
    private LocalDate resignDate;

    @Schema(description = "关联系统用户 ID")
    private Long userId;

    @Schema(description = "创建人")
    private String createBy;

    @Schema(description = "创建时间")
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime createTime;

    @Schema(description = "更新人")
    private String updateBy;

    @Schema(description = "更新时间")
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime updateTime;
}
