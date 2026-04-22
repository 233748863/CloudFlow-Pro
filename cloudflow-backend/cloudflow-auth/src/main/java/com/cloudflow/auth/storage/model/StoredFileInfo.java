package com.cloudflow.auth.storage.model;

import lombok.Builder;
import lombok.Data;

/**
 * 存储后的文件信息。
 * <p>
 * persistedUrl 用于数据库持久化。
 * filePath 用于删除文件或重新解析访问地址。
 */
@Data
@Builder
public class StoredFileInfo {

    /**
     * 底层存储中的文件路径或对象 key。
     */
    private String filePath;

    /**
     * 写入数据库的持久化地址。
     */
    private String persistedUrl;
}
