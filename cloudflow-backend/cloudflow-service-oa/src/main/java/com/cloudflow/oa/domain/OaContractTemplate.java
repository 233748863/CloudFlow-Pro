package com.cloudflow.oa.domain;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.annotation.Version;
import com.fasterxml.jackson.annotation.JsonFormat;
import lombok.Data;

import java.io.Serializable;
import java.time.LocalDateTime;

/**
 * OA-P0-2 合同模板。
 */
@Data
@TableName("oa_contract_template")
public class OaContractTemplate implements Serializable {
    private static final long serialVersionUID = 1L;

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long tenantId;
    private String templateCode;
    private String templateName;
    private String category;
    private String content;

    /** 变量定义 JSON, 形如 [{"key":"partyA","label":"甲方","required":true}, ...] */
    private String variables;
    private String status;
    private String remark;
    private Integer deleted;
    @Version
    private Integer version;
    private String createBy;

    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime createTime;

    private String updateBy;

    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime updateTime;
}
