package com.cloudflow.common.oss.core;

import cn.hutool.core.io.IoUtil;
import cn.hutool.core.util.IdUtil;
import lombok.extern.slf4j.Slf4j;
import com.cloudflow.common.oss.constant.OssConstant;
import com.cloudflow.common.oss.entity.UploadResult;
import com.cloudflow.common.oss.enums.AccessPolicyType;
import com.cloudflow.common.oss.exception.OssException;
import com.cloudflow.common.oss.properties.OssProperties;
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.core.async.BlockingInputStreamAsyncRequestBody;
import software.amazon.awssdk.http.nio.netty.NettyNioAsyncHttpClient;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3AsyncClient;
import software.amazon.awssdk.services.s3.S3Configuration;
import software.amazon.awssdk.services.s3.presigner.S3Presigner;
import software.amazon.awssdk.transfer.s3.S3TransferManager;
import software.amazon.awssdk.transfer.s3.model.*;

import java.io.*;
import java.net.URI;
import java.net.URL;
import java.time.Duration;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.Arrays;

/**
 * S3 协议对象存储客户端
 * 兼容所有 S3 协议的云厂商：MinIO、阿里云 OSS、腾讯云 COS、七牛云、AWS S3 等
 *
 * 使用示例：
 * OssClient client = new OssClient("minio", ossProperties);
 * UploadResult result = client.upload(inputStream, "test.jpg", fileSize, "image/jpeg");
 *
 * @author CloudFlow
 */
@Slf4j
public class OssClient {

    /**
     * 配置键（标识当前使用的存储服务商）
     */
    private final String configKey;

    /**
     * OSS 配置属性
     */
    private final OssProperties properties;

    /**
     * S3 异步客户端
     */
    private final S3AsyncClient client;

    /**
     * S3 传输管理器（支持大文件分片上传/下载）
     */
    private final S3TransferManager transferManager;

    /**
     * S3 预签名 URL 生成器
     */
    private final S3Presigner presigner;

    /**
     * 构造方法：初始化 S3 客户端
     *
     * @param configKey     配置键（如 minio、aliyun、tencent）
     * @param ossProperties OSS 配置属性
     */
    public OssClient(String configKey, OssProperties ossProperties) {
        this.configKey = configKey;
        this.properties = ossProperties;
        try {
            // 创建 AWS 认证信息
            StaticCredentialsProvider credentialsProvider = StaticCredentialsProvider.create(
                    AwsBasicCredentials.create(properties.getAccessKey(), properties.getSecretKey()));

            // MinIO 等私有部署需要启用路径样式访问（path-style）
            boolean isPathStyle = !containsAny(properties.getEndpoint(), OssConstant.CLOUD_SERVICE);

            // 创建 S3 异步客户端
            this.client = S3AsyncClient.builder()
                    .credentialsProvider(credentialsProvider)
                    .endpointOverride(URI.create(getEndpoint()))
                    .region(getRegion())
                    .forcePathStyle(isPathStyle)
                    .httpClient(NettyNioAsyncHttpClient.builder()
                            .connectionTimeout(Duration.ofSeconds(60))
                            .connectionAcquisitionTimeout(Duration.ofSeconds(30))
                            .maxConcurrency(100)
                            .build())
                    .build();

            // 创建传输管理器
            this.transferManager = S3TransferManager.builder().s3Client(this.client).build();

            // 创建预签名 URL 生成器
            S3Configuration config = S3Configuration.builder()
                    .chunkedEncodingEnabled(false)
                    .pathStyleAccessEnabled(isPathStyle)
                    .build();

            this.presigner = S3Presigner.builder()
                    .region(getRegion())
                    .credentialsProvider(credentialsProvider)
                    .endpointOverride(URI.create(getDomain()))
                    .serviceConfiguration(config)
                    .build();

        } catch (Exception e) {
            if (e instanceof OssException) {
                throw e;
            }
            throw new OssException("OSS 配置错误，请检查系统配置: " + e.getMessage(), e);
        }
    }

    /**
     * 上传输入流到 OSS
     *
     * @param inputStream 文件输入流
     * @param key         存储对象键（文件路径）
     * @param length      文件大小（字节）
     * @param contentType 文件 MIME 类型
     * @return 上传结果
     */
    public UploadResult upload(InputStream inputStream, String key, Long length, String contentType) {
        // 确保输入流可重复读取
        if (!(inputStream instanceof ByteArrayInputStream)) {
            inputStream = new ByteArrayInputStream(IoUtil.readBytes(inputStream));
        }
        try {
            // 创建异步请求体 - 使用正确的API
            BlockingInputStreamAsyncRequestBody body = 
                BlockingInputStreamAsyncRequestBody.builder()
                    .contentLength(length)
                    .build();

            // 执行上传
            Upload upload = transferManager.upload(x -> {
                x.requestBody(body).putObjectRequest(
                        y -> y.bucket(properties.getBucketName())
                                .key(key)
                                .contentType(contentType)
                                .build()
                );
            });

            // 写入输入流数据
            body.writeInputStream(inputStream);

            // 等待上传完成
            CompletedUpload uploadResult = upload.completionFuture().join();
            String eTag = uploadResult.response().eTag();

            return UploadResult.builder()
                    .url(getUrl() + "/" + key)
                    .filename(key)
                    .eTag(eTag)
                    .build();
        } catch (Exception e) {
            throw new OssException("上传文件失败: " + e.getMessage(), e);
        }
    }

    /**
     * 上传字节数组到 OSS
     *
     * @param data        文件字节数组
     * @param suffix      文件后缀（如 .jpg、.pdf）
     * @param contentType 文件 MIME 类型
     * @return 上传结果
     */
    public UploadResult uploadSuffix(byte[] data, String suffix, String contentType) {
        return upload(new ByteArrayInputStream(data),
                getPath(properties.getPrefix(), suffix),
                (long) data.length, contentType);
    }

    /**
     * 上传输入流到 OSS（自动生成文件路径）
     *
     * @param inputStream 文件输入流
     * @param suffix      文件后缀
     * @param length      文件大小
     * @param contentType 文件 MIME 类型
     * @return 上传结果
     */
    public UploadResult uploadSuffix(InputStream inputStream, String suffix, Long length, String contentType) {
        return upload(inputStream, getPath(properties.getPrefix(), suffix), length, contentType);
    }

    /**
     * 删除 OSS 中的文件
     *
     * @param path 文件完整路径（URL 或 key）
     */
    public void delete(String path) {
        try {
            String key = removeBaseUrl(path);
            client.deleteObject(x -> x.bucket(properties.getBucketName()).key(key).build());
        } catch (Exception e) {
            throw new OssException("删除文件失败: " + e.getMessage(), e);
        }
    }

    /**
     * 生成文件下载的预签名 URL
     *
     * @param objectKey   对象键
     * @param expiredTime 过期时间
     * @return 预签名 URL
     */
    public String getPresignedUrl(String objectKey, Duration expiredTime) {
        URL url = presigner.presignGetObject(
                x -> x.signatureDuration(expiredTime)
                        .getObjectRequest(y -> y.bucket(properties.getBucketName()).key(objectKey).build())
                        .build()
        ).url();
        return url.toExternalForm();
    }

    /**
     * 获取完整的 Endpoint URL（含协议头）
     */
    public String getEndpoint() {
        return getProtocol() + properties.getEndpoint();
    }

    /**
     * 获取自定义域名或默认域名
     */
    public String getDomain() {
        String domain = properties.getDomain();
        String endpoint = properties.getEndpoint();
        String protocol = getProtocol();

        // 云服务商
        if (containsAny(endpoint, OssConstant.CLOUD_SERVICE)) {
            return (domain != null && !domain.isEmpty()) ? protocol + domain : protocol + endpoint;
        }
        // MinIO 等私有部署
        if (domain != null && !domain.isEmpty()) {
            if (domain.startsWith("https://") || domain.startsWith("http://")) {
                return domain;
            }
            return protocol + domain;
        }
        return protocol + endpoint;
    }

    /**
     * 获取文件访问的基础 URL
     */
    public String getUrl() {
        String domain = properties.getDomain();
        String endpoint = properties.getEndpoint();
        String protocol = getProtocol();

        // 云服务商：bucket.endpoint 格式
        if (containsAny(endpoint, OssConstant.CLOUD_SERVICE)) {
            return protocol + ((domain != null && !domain.isEmpty()) ? domain : properties.getBucketName() + "." + endpoint);
        }
        // MinIO：endpoint/bucket 格式
        if (domain != null && !domain.isEmpty()) {
            if (domain.startsWith("https://") || domain.startsWith("http://")) {
                return domain + "/" + properties.getBucketName();
            }
            return protocol + domain + "/" + properties.getBucketName();
        }
        return protocol + endpoint + "/" + properties.getBucketName();
    }

    /**
     * 生成唯一的文件存储路径
     * 格式：prefix/yyyy/MM/dd/uuid + suffix
     *
     * @param prefix 路径前缀
     * @param suffix 文件后缀
     * @return 文件存储路径
     */
    public String getPath(String prefix, String suffix) {
        String uuid = IdUtil.fastSimpleUUID();
        String datePath = LocalDate.now().format(DateTimeFormatter.ofPattern("yyyy/MM/dd"));
        String path = (prefix != null && !prefix.isEmpty())
                ? prefix + "/" + datePath + "/" + uuid
                : datePath + "/" + uuid;
        return path + suffix;
    }

    /**
     * 移除 URL 中的基础路径，获取对象键
     */
    public String removeBaseUrl(String path) {
        return path.replace(getUrl() + "/", "");
    }

    /**
     * 获取配置键
     */
    public String getConfigKey() {
        return configKey;
    }

    /**
     * 获取 AWS Region
     */
    private Region getRegion() {
        String region = properties.getRegion();
        return (region != null && !region.isEmpty()) ? Region.of(region) : Region.US_EAST_1;
    }

    /**
     * 获取协议头（http:// 或 https://）
     */
    private String getProtocol() {
        return OssConstant.IS_HTTPS.equals(properties.getIsHttps()) ? "https://" : "http://";
    }

    /**
     * 检查配置是否相同
     */
    public boolean checkPropertiesSame(OssProperties properties) {
        return this.properties.equals(properties);
    }

    /**
     * 获取当前桶权限类型
     */
    public AccessPolicyType getAccessPolicy() {
        return AccessPolicyType.getByType(properties.getAccessPolicy());
    }

    /**
     * 检查字符串是否包含数组中的任意一个关键字
     */
    private static boolean containsAny(String str, String[] keywords) {
        if (str == null) return false;
        return Arrays.stream(keywords).anyMatch(str::contains);
    }
}
