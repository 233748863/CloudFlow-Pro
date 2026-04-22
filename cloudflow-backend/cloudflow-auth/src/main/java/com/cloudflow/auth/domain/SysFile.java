package com.cloudflow.auth.domain;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.fasterxml.jackson.annotation.JsonFormat;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("sys_file")
public class SysFile {

    @TableId(type = IdType.AUTO)
    private Long fileId;

    @TableField("tenant_id")
    private Long tenantId;

    private String fileName;

    private String filePath;

    private String url;

    /**
     * 存储类型：LOCAL/OSS。
     */
    private String storageType;

    private Long fileSize;

    private String fileType;

    private String createBy;

    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime createTime;

    private String delFlag;

    private String remark;
}
