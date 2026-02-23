package com.cloudflow.auth.domain;

import com.baomidou.mybatisplus.annotation.IdType;
import com.fasterxml.jackson.annotation.JsonFormat;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
import java.time.LocalDateTime;

@Data
@TableName("sys_file")
public class SysFile {
    @TableId(type = IdType.AUTO)
    private Long fileId;

    private String fileName;

    private String filePath;

    private String url;

    private Long fileSize;

    private String fileType;

    private String createBy;

    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")


    private LocalDateTime createTime;

    /** 删除标志（0代表存在 2代表删除） */
    private String delFlag;
    
    private String remark;
}
