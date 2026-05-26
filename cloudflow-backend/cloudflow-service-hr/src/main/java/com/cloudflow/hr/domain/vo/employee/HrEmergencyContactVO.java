package com.cloudflow.hr.domain.vo.employee;

import com.fasterxml.jackson.annotation.JsonFormat;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * HR 紧急联系人 VO（剔除 deleted/tenantId；phone/address 由 HrTypedCrudService.maskRow 按权限掩码）。
 */
@Data
@Schema(name = "HrEmergencyContactVO", description = "HR 紧急联系人 VO")
public class HrEmergencyContactVO {

    @Schema(description = "记录 ID")
    private Long id;

    @Schema(description = "员工 ID")
    private Long employeeId;

    @Schema(description = "联系人姓名")
    private String contactName;

    @Schema(description = "关系")
    private String relationship;

    @Schema(description = "联系电话（按权限掩码）")
    private String phone;

    @Schema(description = "联系地址（按权限掩码）")
    private String address;

    @Schema(description = "优先级")
    private Integer priority;

    @Schema(description = "创建时间")
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime createTime;

    @Schema(description = "更新时间")
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime updateTime;
}
