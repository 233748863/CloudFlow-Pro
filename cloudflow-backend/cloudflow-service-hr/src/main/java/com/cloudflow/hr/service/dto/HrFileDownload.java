package com.cloudflow.hr.service.dto;

import lombok.Data;

/**
 * HR 文件下载内部传输对象（Service↔Controller 二进制传输）。
 *
 * <p>不参与 JSON 序列化，仅承载文件名/MIME/字节流。
 */
@Data
public class HrFileDownload {

    private String fileName;
    private String contentType;
    private byte[] bytes;
    private String businessNo;
}
