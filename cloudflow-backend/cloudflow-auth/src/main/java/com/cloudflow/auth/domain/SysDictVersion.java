package com.cloudflow.auth.domain;

import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("sys_dict_version")
public class SysDictVersion {

    @TableId
    private Long id;

    private Long tenantId;

    private String dictType;

    private Integer versionNo;

    private String snapshotJson;

    private String publishedBy;

    private LocalDateTime publishedAt;
}
