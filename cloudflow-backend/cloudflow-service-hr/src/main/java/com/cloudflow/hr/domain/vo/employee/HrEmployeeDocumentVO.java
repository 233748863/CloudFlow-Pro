package com.cloudflow.hr.domain.vo.employee;

import com.fasterxml.jackson.annotation.JsonFormat;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

/**
 * HR 员工证件 VO（剔除 deleted/tenantId；documentNo 由 HrTypedCrudService.maskRow 按权限掩码）。
 */
@Data
@Schema(name = "HrEmployeeDocumentVO", description = "HR 员工证件 VO")
public class HrEmployeeDocumentVO {

    @Schema(description = "证件 ID")
    private Long id;

    @Schema(description = "员工 ID")
    private Long employeeId;

    @Schema(description = "证件类型")
    private String documentType;

    @Schema(description = "证件号（按权限掩码）")
    private String documentNo;

    @Schema(description = "签发日期")
    private LocalDate issueDate;

    @Schema(description = "失效日期")
    private LocalDate expiryDate;

    @Schema(description = "附件 URL 列表")
    private List<String> attachmentUrls;

    @Schema(description = "创建时间")
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime createTime;

    @Schema(description = "更新时间")
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime updateTime;
}
