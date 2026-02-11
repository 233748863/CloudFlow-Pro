package cn.joywon.poco.merchant.MerchantModule.vo;

import cn.joywon.poco.merchant.MerchantModule.definition.AuditStatusEnum;
import cn.joywon.poco.merchant.MerchantModule.definition.BusinessStatusEnum;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.time.LocalDateTime;
import java.util.List;

@Data
@Schema(description = "商家审核信息返回数据")
public class MerchantAuditDetailVO {

    @Schema(description = "审核记录ID")
    private Long auditId;

    @Schema(description = "商家名称")
    private String name;

    @Schema(description = "商家logo图片URL")
    private String logoUrl;

    @Schema(description = "商家图片URL列表")
    private List<String> images;

    @Schema(description = "商家简介")
    private String description;

    @Schema(description = "联系人姓名")
    private String contactName;

    @Schema(description = "商家联系电话")
    private String contactPhone;

    @Schema(description = "商家地区编码")
    private String regionCode;

    @Schema(description = "商家所在地区")
    private String location;

    @Schema(description = "商家详细地址")
    private String addressDetail;

    @Schema(description = "行业分类名称")
    private String industryName;

    @Schema(description = "商家经营状态: PREPARING-准备中; OPERATING-经营中; SUSPENDED-停业中; TERMINATED-已结业")
    private BusinessStatusEnum businessStatus;

    @Schema(description = "审核状态: PENDING-待审核; APPROVED-通过; REJECTED-拒绝")
    private AuditStatusEnum auditStatus;

    @Schema(description = "审核类型: CREATE-创建; REVISION-修改")
    private AuditStatusEnum auditType;

    @Schema(description = "商家审核备注")
    private String auditRemark;

    @Schema(description = "审核时间")
    private LocalDateTime auditTime;

    @Schema(description = "修改原因")
    private String modifyReason;

    @Schema(description = "区域代理ID")
    private Long agentId;

    @Schema(description = "区域代理名称")
    private String agentName;

    @Schema(description = "法人姓名")
    private String legalPerson;

    @Schema(description = "营业执照编号")
    private String licenseNo;

    @Schema(description = "商家资质图片URL列表")
    private List<String> licenseImages;

    @Schema(description = "审核提交时间")
    private LocalDateTime createdTime;

    @Schema(description = "商家是否启用: true-启用; false-禁用")
    private Boolean enable;

}