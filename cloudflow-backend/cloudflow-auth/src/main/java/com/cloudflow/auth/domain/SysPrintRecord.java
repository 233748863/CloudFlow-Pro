package com.cloudflow.auth.domain;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.fasterxml.jackson.annotation.JsonFormat;
import java.time.LocalDateTime;
import lombok.Data;

/** 生成成功的打印记录；直接返回文件时不保存文件副本。 */
@Data
@TableName("sys_print_record")
public class SysPrintRecord {
    @TableId(type = IdType.AUTO)
    private Long recordId;
    private Long tenantId;
    private Long templateId;
    private String templateCode;
    private String bizType;
    private String bizId;
    private String outputFormat;
    private String fileUrl;
    private Long operatorId;
    private String operatorName;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime printTime;
    private String ipAddress;
    private Long fileSize;
    private String createBy;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime createTime;
}
