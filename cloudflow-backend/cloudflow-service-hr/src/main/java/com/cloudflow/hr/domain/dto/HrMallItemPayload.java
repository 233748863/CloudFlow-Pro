package com.cloudflow.hr.domain.dto;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.extension.handlers.JacksonTypeHandler;
import lombok.Data;

import java.time.LocalDateTime;
import java.util.List;

@Data
@TableName(value = "hr_mall_item", autoResultMap = true)
public class HrMallItemPayload {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long tenantId;
    private String itemNo;
    private String itemName;
    private String category;
    private Integer pointPrice;
    private Integer stock;
    private Integer salesCount;
    private String coverImage;

    @TableField(typeHandler = JacksonTypeHandler.class)
    private List<String> images;

    private String detailHtml;
    private String status;
    private Integer approvalThreshold;
    private LocalDateTime createTime;
    private LocalDateTime updateTime;
    private String createBy;
    private String updateBy;
    private Integer deleted;
    private Integer version;
}
