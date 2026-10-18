package com.cloudflow.crm.domain;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import java.time.LocalDateTime;
import lombok.Data;
import lombok.ToString;

@Data
@ToString(onlyExplicitlyIncluded = true)
@TableName("sys_file")
public class CrmEmailPrivateFile {
    @TableId(type = IdType.AUTO)
    @ToString.Include
    private Long fileId;
    private Long tenantId;
    private String fileName;
    private String filePath;
    private String url;
    private String storageType;
    private Long fileSize;
    private String fileType;
    private String fileHash;
    private String accessType;
    private String bizType;
    private String bizId;
    private String createBy;
    private LocalDateTime createTime;
    private Integer deleted;
}
