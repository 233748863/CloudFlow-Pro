package com.cloudflow.auth.service.impl;

import cn.hutool.core.io.FileUtil;
import cn.hutool.core.util.StrUtil;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.auth.domain.SysFile;
import com.cloudflow.auth.mapper.SysFileMapper;
import com.cloudflow.auth.service.ISysFileService;
import com.cloudflow.common.config.CloudFlowConfig;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.utils.file.FileUploadUtils;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.util.Arrays;
import java.util.Date;

@Service
public class SysFileServiceImpl implements ISysFileService {

    @Autowired
    private SysFileMapper sysFileMapper;

    @Override
    public SysFile uploadFile(MultipartFile file) {
        try {
            String originalFilename = file.getOriginalFilename();
            String contentType = file.getContentType();
            long size = file.getSize();
            
            // 上传到本地
            String fileName = FileUploadUtils.upload(CloudFlowConfig.getUploadPath(), file);
            // 生成完整访问URL (这里假设有个资源映射或者网关转发 /profile/** -> 本地路径)
            // 简单起见，这里存储相对路径或完整路径
            // 如果前端要访问，通常需要后端提供一个资源访问接口，或者配置Nginx
            // 现在的实现：url 存的是 /profile/upload/2023/10/10/xxx.png 这样的路径
            String url = fileName; 

            SysFile sysFile = new SysFile();
            sysFile.setFileName(originalFilename);
            sysFile.setFilePath(fileName);
            sysFile.setUrl(url);
            sysFile.setFileSize(size);
            sysFile.setFileType(FileUtil.extName(originalFilename));
            sysFile.setCreateTime(new Date());
            sysFile.setCreateBy(UserContext.getUserName());
            sysFile.setDelFlag("0");
            
            sysFileMapper.insert(sysFile);
            return sysFile;
        } catch (Exception e) {
            throw new RuntimeException("文件上传失败: " + e.getMessage());
        }
    }

    @Override
    public PageResult<SysFile> selectFileList(SysFile sysFile, PageQuery pageQuery) {
        Page<SysFile> page = new Page<>(pageQuery.getPageNum(), pageQuery.getPageSize());
        LambdaQueryWrapper<SysFile> wrapper = new LambdaQueryWrapper<>();
        
        if (StrUtil.isNotBlank(sysFile.getFileName())) {
            wrapper.like(SysFile::getFileName, sysFile.getFileName());
        }
        if (StrUtil.isNotBlank(sysFile.getFileType())) {
            wrapper.eq(SysFile::getFileType, sysFile.getFileType());
        }
        
        wrapper.eq(SysFile::getDelFlag, "0");
        wrapper.orderByDesc(SysFile::getCreateTime);
        
        Page<SysFile> result = sysFileMapper.selectPage(page, wrapper);
        return new PageResult<>(result.getRecords(), result.getTotal(), result.getCurrent(), result.getSize());
    }

    @Override
    public void deleteFileByIds(Long[] fileIds) {
        // 逻辑删除
        for (Long id : fileIds) {
            SysFile file = new SysFile();
            file.setFileId(id);
            file.setDelFlag("2");
            sysFileMapper.updateById(file);
        }
    }
}
