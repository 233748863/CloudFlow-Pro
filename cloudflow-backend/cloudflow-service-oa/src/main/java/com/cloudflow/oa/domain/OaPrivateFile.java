package com.cloudflow.oa.domain;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
import java.time.LocalDateTime;

@Data
@TableName("sys_file")
public class OaPrivateFile {
    @TableId(type = IdType.AUTO)
    private Long fileId;
    private Long tenantId;
    private String fileName;
    private String filePath;
    private String url;
    private String storageType;
    private Long fileSize;
    private String fileType;
    private String createBy;
    private LocalDateTime createTime;
    private Integer deleted;
    private String remark;
}
