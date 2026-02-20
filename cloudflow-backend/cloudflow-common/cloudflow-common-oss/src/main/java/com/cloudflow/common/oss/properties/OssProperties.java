package com.cloudflow.common.oss.properties;

import lombok.Data;

/**
 * OSS 对象存储配置属性
 * 兼容所有 S3 协议的云存储服务（MinIO、阿里云 OSS、腾讯云 COS、七牛云等）
 *
 * 配置示例（application.yml）：
 * cloudflow:
 *   oss:
 *     endpoint: s3.amazonaws.com          # 或 MinIO 地址如 localhost:9000
 *     access-key: your-access-key
 *     secret-key: your-secret-key
 *     bucket-name: cloudflow-bucket
 *     region: us-east-1
 *     is-https: Y                         # 是否使用 HTTPS
 *     prefix: upload                      # 文件路径前缀
 *     domain:                             # 自定义域名（CDN 加速等场景）
 *
 * @author CloudFlow
 */
@Data
public class OssProperties {

    /**
     * 访问站点（Endpoint）
     * 例如：s3.amazonaws.com / oss-cn-hangzhou.aliyuncs.com / localhost:9000
     */
    private String endpoint;

    /**
     * 自定义域名（可选）
     * 用于 CDN 加速或自定义域名访问场景
     */
    private String domain;

    /**
     * 前缀（文件路径前缀）
     * 例如：upload，上传的文件会存储在 bucket/upload/ 目录下
     */
    private String prefix;

    /**
     * ACCESS_KEY（访问密钥 ID）
     */
    private String accessKey;

    /**
     * SECRET_KEY（访问密钥密码）
     */
    private String secretKey;

    /**
     * 存储桶名称
     */
    private String bucketName;

    /**
     * 存储区域
     * 例如：us-east-1 / cn-hangzhou
     */
    private String region;

    /**
     * 是否使用 HTTPS
     * Y=是，N=否
     */
    private String isHttps = "N";

    /**
     * 桶权限类型
     * 0=private（私有），1=public（公共读），2=custom（自定义）
     */
    private String accessPolicy = "1";
}
