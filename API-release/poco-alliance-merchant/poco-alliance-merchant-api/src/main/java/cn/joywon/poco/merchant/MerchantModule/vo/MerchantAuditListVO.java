package cn.joywon.poco.merchant.MerchantModule.vo;

import cn.joywon.poco.merchant.MerchantModule.definition.AuditStatusEnum;
import cn.joywon.poco.merchant.MerchantModule.definition.BusinessStatusEnum;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@Schema(description = "商家审核列表返回数据")
public class MerchantAuditListVO {

    @Schema(description = "审核记录ID")
    private Long auditId;

    @Schema(description = "商家名称")
    private String merchantName;

    @Schema(description = "商家logo图片URL")
    private String logoUrl;

    @Schema(description = "联系人姓名")
    private String contactName;

    @Schema(description = "商家联系电话")
    private String contactPhone;

    @Schema(description = "商家地址")
    private String addressDetail;

    @Schema(description = "商家经营状态: PREPARING-准备中; OPERATING-经营中; SUSPENDED-停业中; TERMINATED-已结业")
    private BusinessStatusEnum businessStatus;

    @Schema(description = "审核状态: PENDING-待审核; APPROVED-通过; REJECTED-拒绝")
    private AuditStatusEnum auditStatus;

    @Schema(description = "审核类型: CREATE-创建; REVISION-修改")
    private AuditStatusEnum auditType;

    @Schema(description = "法人姓名")
    private String legalPerson;

    @Schema(description = "营业执照编号")
    private String licenseNo;

    @Schema(description = "提交审核时间")
    private LocalDateTime createdTime;

    @Schema(description = "行业分类名称")
    private String industryName;

}