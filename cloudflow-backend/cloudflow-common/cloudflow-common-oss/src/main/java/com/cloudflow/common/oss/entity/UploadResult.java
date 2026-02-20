package com.cloudflow.common.oss.entity;

import lombok.Builder;
import lombok.Data;

/**
 * 文件上传结果
 *
 * @author CloudFlow
 */
@Data
@Builder
public class UploadResult {

    /**
     * 文件访问 URL
     */
    private String url;

    /**
     * 文件在存储中的 key（相对路径）
     */
    private String filename;

    /**
     * ETag（文件内容的 MD5 哈希值）
     */
    private String eTag;
}
