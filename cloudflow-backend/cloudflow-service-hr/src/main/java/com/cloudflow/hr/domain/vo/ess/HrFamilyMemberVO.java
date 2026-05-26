package com.cloudflow.hr.domain.vo.ess;

import com.fasterxml.jackson.annotation.JsonFormat;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * HR 家庭成员 VO（idCardNo/phone 按权限掩码，剔除 deleted/tenantId）。
 */
@Data
@Schema(name = "HrFamilyMemberVO", description = "HR 家庭成员 VO")
public class HrFamilyMemberVO {
    @Schema(description = "ID") private Long id;
    @Schema(description = "员工 ID") private Long employeeId;
    @Schema(description = "成员姓名") private String memberName;
    @Schema(description = "关系") private String relationship;
    @Schema(description = "身份证号（按权限掩码）") private String idCardNo;
    @Schema(description = "出生日期") private LocalDate birthDate;
    @Schema(description = "职业") private String occupation;
    @Schema(description = "电话（按权限掩码）") private String phone;
    @Schema(description = "是否被扶养") private Boolean isDependent;
    @Schema(description = "备注") private String remark;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") private LocalDateTime createTime;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") private LocalDateTime updateTime;
    @Schema(description = "创建人") private String createBy;
    @Schema(description = "更新人") private String updateBy;
}
