package com.cloudflow.auth.storage;

import com.cloudflow.auth.domain.SysFileConfig;
import com.cloudflow.auth.enums.FileStorageType;
import com.cloudflow.common.config.CloudFlowConfig;
import com.cloudflow.common.core.exception.ServiceException;

import java.io.IOException;
import java.net.URI;
import java.nio.file.Path;
import java.util.Set;

public final class FileStorageRules {
    private FileStorageRules() {
    }

    public static void validate(SysFileConfig config) {
        requireText(config.getConfigCode(), 50, "配置编码");
        requireText(config.getConfigName(), 100, "配置名称");
        if (!config.getConfigCode().matches("[A-Za-z0-9_-]+")) {
            throw new ServiceException("配置编码只允许字母、数字、下划线和短横线");
        }
        FileStorageType type = FileStorageType.fromValue(config.getStorageType());
        if (!Set.of("ENABLED", "DISABLED").contains(String.valueOf(config.getStatus()))) {
            throw new ServiceException("无效的存储配置状态");
        }
        if (config.getMasterFlag() == null || config.getMasterFlag() < 0 || config.getMasterFlag() > 1) {
            throw new ServiceException("主用标记必须为0或1");
        }
        if (config.getMasterFlag() == 1 && !"ENABLED".equals(config.getStatus())) {
            throw new ServiceException("主用配置必须处于启用状态");
        }
        if (config.getMaxFileSize() == null || config.getMaxFileSize() < 1) {
            throw new ServiceException("单文件上限必须大于0字节");
        }
        if (config.getSignedUrlExpireSeconds() == null || config.getSignedUrlExpireSeconds() < 1
                || config.getSignedUrlExpireSeconds() > 3600) {
            throw new ServiceException("签名有效期必须为1至3600秒");
        }
        limit(config.getBasePath(), 300, "基础路径");
        limit(config.getAllowedExtensions(), 1000, "扩展名清单");
        limit(config.getRemark(), 500, "备注");
        if (config.getAllowedExtensions() != null && !config.getAllowedExtensions().isBlank()
                && !config.getAllowedExtensions().matches("[A-Za-z0-9]+(,[A-Za-z0-9]+)*")) {
            throw new ServiceException("扩展名使用英文逗号分隔，不包含点号或通配符");
        }
        if (type == FileStorageType.LOCAL) {
            localDirectory(config.getBasePath());
            return;
        }
        if (!"0".equals(config.getAccessPolicy())) {
            throw new ServiceException("对象存储必须配置为私有访问：accessPolicy=0");
        }
        endpoint(config.getEndpoint(), true);
        endpoint(config.getDomain(), false);
        requireText(config.getBucket(), 100, "桶名");
        requireText(config.getRegion(), 50, "区域");
        requireText(config.getAccessKey(), 200, "AccessKey");
        requireText(config.getSecretKeyCipher(), 500, "已加密SecretKey");
        if (config.getBasePath() != null && (config.getBasePath().contains("..") || config.getBasePath().contains("\\"))) {
            throw new ServiceException("对象前缀不能包含上级路径或反斜杠");
        }
    }

    public static Path localDirectory(String relative) {
        try {
            Path root = Path.of(CloudFlowConfig.getProfile()).toFile().getCanonicalFile().toPath();
            String value = relative == null || relative.isBlank() ? "upload" : relative;
            Path candidate = Path.of(value);
            if (candidate.isAbsolute()) {
                throw new ServiceException("本地存储基础路径必须是文件根目录内的相对路径");
            }
            Path resolved = root.resolve(candidate).toFile().getCanonicalFile().toPath();
            if (!resolved.startsWith(root) || resolved.equals(root)) {
                throw new ServiceException("本地存储路径超出文件根目录");
            }
            return resolved;
        } catch (IOException | IllegalArgumentException exception) {
            throw new ServiceException("本地存储路径无效");
        }
    }

    public static Path localFile(String reference) {
        try {
            Path root = Path.of(CloudFlowConfig.getProfile()).toFile().getCanonicalFile().toPath();
            Path target = root.resolve(reference.replaceFirst("^/", "")).toFile().getCanonicalFile().toPath();
            if (!target.startsWith(root) || target.equals(root)) {
                throw new ServiceException("文件路径超出文件根目录", 403);
            }
            return target;
        } catch (IOException | IllegalArgumentException exception) {
            throw new ServiceException("文件路径无效", 403);
        }
    }

    private static void endpoint(String value, boolean required) {
        if (value == null || value.isBlank()) {
            if (required) throw new ServiceException("对象存储端点不能为空");
            return;
        }
        limit(value, 300, "端点");
        try {
            URI uri = URI.create(value.contains("://") ? value : "https://" + value);
            if (!Set.of("http", "https").contains(String.valueOf(uri.getScheme())) || uri.getHost() == null
                    || uri.getUserInfo() != null || uri.getQuery() != null || uri.getFragment() != null
                    || (uri.getPath() != null && !uri.getPath().isEmpty() && !uri.getPath().equals("/"))) {
                throw new IllegalArgumentException();
            }
        } catch (IllegalArgumentException exception) {
            throw new ServiceException("端点必须是HTTP或HTTPS主机地址，不能携带账号、路径或查询参数");
        }
    }

    private static void requireText(String value, int maximum, String label) {
        if (value == null || value.isBlank()) throw new ServiceException(label + "不能为空");
        limit(value, maximum, label);
    }

    private static void limit(String value, int maximum, String label) {
        if (value != null && value.length() > maximum) throw new ServiceException(label + "长度超出限制");
    }
}
