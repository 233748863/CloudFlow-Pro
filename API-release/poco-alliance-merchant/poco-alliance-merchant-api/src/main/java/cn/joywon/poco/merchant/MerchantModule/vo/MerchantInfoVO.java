package cn.joywon.poco.merchant.MerchantModule.vo;

import cn.joywon.poco.merchant.MerchantModule.definition.BusinessStatusEnum;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.time.LocalDateTime;
import java.util.List;

@Data
@Schema(description = "商家信息返回数据")
public class MerchantInfoVO {

    @Schema(description = "商家ID")
    private Long id;

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

    @Schema(description = "商家所在区域")
    private String location;

    @Schema(description = "商家详细地址")
    private String addressDetail;

    @Schema(description = "行业分类ID")
    private Long industryId;

    @Schema(description = "行业分类名称")
    private String industryName;

    @Schema(description = "商家经营状态: PREPARING-准备中; OPERATING-经营中; SUSPENDED-停业中; TERMINATED-已结业")
    private BusinessStatusEnum businessStatus;

    @Schema(description = "创建时间")
    private LocalDateTime createdTime;

    @Schema(description = "是否正在审核中")
    private Boolean auditing;

    @Schema(description = "是否被平台启用: true-启用; false-禁用")
    private Boolean enable;

}