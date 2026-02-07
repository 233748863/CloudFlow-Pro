package com.cloudflow.common.core.utils.file;

import cn.hutool.core.io.FileUtil;
import cn.hutool.core.util.IdUtil;
import cn.hutool.core.util.StrUtil;
import com.cloudflow.common.config.CloudFlowConfig;
import com.cloudflow.common.core.utils.DateUtils;
import org.springframework.web.multipart.MultipartFile;
import java.io.File;
import java.io.IOException;
import java.util.Objects;

public class FileUploadUtils {
    /**
     * 默认大小 50M
     */
    public static final long DEFAULT_MAX_SIZE = 50 * 1024 * 1024;

    /**
     * 默认的文件名最大长度 100
     */
    public static final int DEFAULT_FILE_NAME_LENGTH = 100;

    /**
     * 根据文件路径上传
     *
     * @param baseDir 相对应用的基目录
     * @param file 上传的文件
     * @return 文件名称
     * @throws IOException
     */
    public static final String upload(String baseDir, MultipartFile file) throws IOException {
        try {
            return upload(baseDir, file, MimeTypeUtils.DEFAULT_ALLOWED_EXTENSION);
        } catch (Exception e) {
            throw new IOException(e.getMessage(), e);
        }
    }

    /**
     * 文件上传
     *
     * @param baseDir 相对应用的基目录
     * @param file 上传的文件
     * @param allowedExtension 上传文件类型
     * @return 返回上传成功的文件名
     * @throws IOException 比如读写文件出错时
     */
    public static final String upload(String baseDir, MultipartFile file, String[] allowedExtension)
            throws Exception {
        int fileNamelength = Objects.requireNonNull(file.getOriginalFilename()).length();
        if (fileNamelength > DEFAULT_FILE_NAME_LENGTH) {
            throw new Exception("文件名过长");
        }

        assertAllowed(file, allowedExtension);

        String fileName = extractFilename(file);

        File desc = getAbsoluteFile(baseDir, fileName);
        file.transferTo(desc);
        return getPathFileName(baseDir, fileName);
    }

    /**
     * 编码文件名
     */
    public static final String extractFilename(MultipartFile file) {
        return StrUtil.format("{}/{}_{}.{}", DateUtils.datePath(),
                FileUtil.mainName(file.getOriginalFilename()), IdUtil.fastSimpleUUID(), getExtension(file));
    }

    private static final File getAbsoluteFile(String uploadDir, String fileName) throws IOException {
        File desc = new File(uploadDir + File.separator + fileName);

        if (!desc.exists()) {
            if (!desc.getParentFile().exists()) {
                desc.getParentFile().mkdirs();
            }
        }
        return desc;
    }

    private static final String getPathFileName(String uploadDir, String fileName) throws IOException {
        int dirLastIndex = CloudFlowConfig.getProfile().length() + 1;
        String currentDir = StrUtil.subSuf(uploadDir, dirLastIndex);
        return "/" + currentDir + "/" + fileName;
    }

    /**
     * 文件大小校验
     *
     * @param file 上传的文件
     * @throws Exception
     */
    public static final void assertAllowed(MultipartFile file, String[] allowedExtension)
            throws Exception {
        long size = file.getSize();
        if (size > DEFAULT_MAX_SIZE) {
            throw new Exception("文件大小超出限制");
        }

        String fileName = file.getOriginalFilename();
        String extension = getExtension(file);
        if (allowedExtension != null && !isAllowedExtension(extension, allowedExtension)) {
             throw new Exception("文件类型不合法: " + extension);
        }
    }

    /**
     * 判断MIME类型是否是允许的MIME类型
     *
     * @param extension
     * @param allowedExtension
     * @return
     */
    public static final boolean isAllowedExtension(String extension, String[] allowedExtension) {
        for (String str : allowedExtension) {
            if (str.equalsIgnoreCase(extension)) {
                return true;
            }
        }
        return false;
    }

    /**
     * 获取文件名的后缀
     *
     * @param file 表单文件
     * @return 后缀名
     */
    public static final String getExtension(MultipartFile file) {
        String extension = FileUtil.extName(file.getOriginalFilename());
        if (StrUtil.isEmpty(extension)) {
            extension = MimeTypeUtils.getExtension(Objects.requireNonNull(file.getContentType()));
        }
        return extension;
    }
}
