package cn.joywon.poco.merchant.MerchantModule.dto;

import cn.joywon.poco.merchant.Common.page.PageQueryDTO;
import cn.joywon.poco.merchant.MerchantModule.definition.AuditStatusEnum;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.PastOrPresent;
import jakarta.validation.constraints.Pattern;
import lombok.Data;
import lombok.EqualsAndHashCode;
import org.springframework.format.annotation.DateTimeFormat;

import java.time.LocalDate;
import java.util.List;

@Data
@EqualsAndHashCode(callSuper = true)
@Schema(description = "门店审核列表查询参数")
public class StoreAuditQueryDTO extends PageQueryDTO {

    @Min(value = 1, message = "无效的商家ID")
    @Schema(description = "商家记录ID")
    private Long merchantId;

    @Schema(description = "门店名称")
    private String name;

    @Schema(description = "行业ID列表")
    private List<String> industryIds;

    @Schema(description = "审核类型列表: CREATE-创建; DELETE-删除; REVISION-修改")
    private List<@Pattern(regexp = AuditStatusEnum.AUDIT_TYPE_STORE_REGEX_PATTERN,
            message = "无效的审核类型") String> auditTypes;

    @Schema(description = "审核状态列表: PENDING-待审核; APPROVED-通过; REJECTED拒绝")
    private List<@Pattern(regexp = AuditStatusEnum.AUDIT_STATUS_REGEX_PATTERN,
            message = "无效的审核状态") String> auditStatuses;

    @Schema(description = "是否按审核记录创建时间升序排序")
    private Boolean orderByCreateTime;

    @DateTimeFormat(pattern = "yyyy-MM-dd")
    @PastOrPresent(message = "无效的查询开始日期")
    @Schema(description = "查询开始时间(yyyy-MM-dd)")
    private LocalDate startDate;

    @DateTimeFormat(pattern = "yyyy-MM-dd")
    @PastOrPresent(message = "无效的查询最后日期")
    @Schema(description = "查询结束时间(yyyy-MM-dd)")
    private LocalDate endDate;

}