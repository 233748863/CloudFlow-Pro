package com.cloudflow.auth.domain;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.FieldStrategy;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.annotation.Version;
import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.annotation.JsonFormat;
import lombok.Data;
import lombok.ToString;

import java.io.Serializable;
import java.time.LocalDateTime;

@Data
@TableName("sys_file_config")
public class SysFileConfig implements Serializable {
    private static final long serialVersionUID = 1L;

    @TableId(type = IdType.AUTO)
    private Long configId;
    private Long tenantId;
    private String configCode;
    private String configName;
    private String storageType;
    private Integer masterFlag;
    private String endpoint;
    private String region;
    private String bucket;
    @ToString.Exclude
    private String accessKey;
    @JsonIgnore
    @ToString.Exclude
    private String secretKeyCipher;
    @TableField(exist = false)
    @JsonProperty(access = JsonProperty.Access.WRITE_ONLY)
    @ToString.Exclude
    private String secretKey;
    @TableField(updateStrategy = FieldStrategy.ALWAYS)
    private String basePath;
    @TableField(updateStrategy = FieldStrategy.ALWAYS)
    private String domain;
    private Long maxFileSize;
    @TableField(updateStrategy = FieldStrategy.ALWAYS)
    private String allowedExtensions;
    private Integer signedUrlExpireSeconds;
    private String accessPolicy;
    private String status;
    @TableField(updateStrategy = FieldStrategy.ALWAYS)
    private String remark;
    @TableField(fill = FieldFill.INSERT)
    private Integer deleted;
    @Version
    private Integer version;
    @TableField(fill = FieldFill.INSERT)
    private String createBy;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createTime;
    @TableField(fill = FieldFill.INSERT_UPDATE)
    private String updateBy;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updateTime;
}
