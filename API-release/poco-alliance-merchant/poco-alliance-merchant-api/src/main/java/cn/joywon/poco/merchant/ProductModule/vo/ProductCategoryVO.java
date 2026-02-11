package cn.joywon.poco.merchant.ProductModule.vo;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 商品分类返回对象
 * 查询返回包含全部字段
 */
@Data
@Schema(description = "商品分类VO")
public class ProductCategoryVO {

    /** 分类ID */
    private Long id;

    /** 父分类ID */
    private Long parentId;

    /** 分类名称 */
    private String name;

    /** 排序序号 */
    private Integer sortOrder;

    /** 创建人ID */
    private String createdBy;

    /** 创建时间 */
    private LocalDateTime createdTime;

    /** 修改人ID */
    private String updatedBy;

    /** 修改时间 */
    private LocalDateTime updatedTime;

    /** 是否已删除(软删除)：0-正常，1-已删除 */
    private String isDeleted;

    /** 删除时间(软删除) */
    private LocalDateTime deletedTime;
    
    /** 子分类列表 */
    @Schema(description = "子分类列表")
    private List<ProductCategoryVO> children;
}