package com.cloudflow.auth.im;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.annotation.Version;
import com.fasterxml.jackson.annotation.JsonFormat;
import com.fasterxml.jackson.annotation.JsonIgnore;
import java.io.Serializable;
import java.time.LocalDateTime;
import lombok.Getter;
import lombok.Setter;
import lombok.ToString;
import org.javers.core.metamodel.annotation.DiffIgnore;

@Getter
@Setter
@ToString(onlyExplicitlyIncluded = true)
@TableName("sys_im_config")
public class ImConfigRow implements Serializable {
    private static final long serialVersionUID = 1L;
    @TableId(type = IdType.AUTO)
    @ToString.Include
    private Long configId;
    @ToString.Include
    private Long tenantId;
    private String imType;
    private String corpId;
    private String agentId;
    @JsonIgnore
    @DiffIgnore
    private String appKeyEncrypted;
    @JsonIgnore
    @DiffIgnore
    private String appSecretEncrypted;
    @JsonIgnore
    @DiffIgnore
    private String tokenEncrypted;
    @JsonIgnore
    @DiffIgnore
    private String aesKeyEncrypted;
    private String callbackUrl;
    private Boolean syncEnabled;
    private String syncCron;
    private Boolean loginEnabled;
    private Boolean messageEnabled;
    private Boolean todoEnabled;
    private String syncScope;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime lastSyncTime;
    private String status;
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
