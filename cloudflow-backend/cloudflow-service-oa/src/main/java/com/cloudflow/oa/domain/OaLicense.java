package com.cloudflow.oa.domain;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.annotation.Version;
import com.fasterxml.jackson.annotation.JsonFormat;
import lombok.Data;

import java.io.Serializable;
import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 证照台账。
 */
@Data
@TableName("oa_license")
public class OaLicense implements Serializable {
    private static final long serialVersionUID = 1L;

    @TableId(type = IdType.AUTO)
    private Long licenseId;

    private Long tenantId;
    private String licenseCode;
    private String licenseName;
    private String licenseType;
    private String licenseNo;
    private String issuer;

    @JsonFormat(pattern = "yyyy-MM-dd")
    private LocalDate issueDate;

    @JsonFormat(pattern = "yyyy-MM-dd")
    private LocalDate expireDate;

    private Long keeperId;
    private String keeperName;
    private String location;
    private String attachmentUrl;
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
