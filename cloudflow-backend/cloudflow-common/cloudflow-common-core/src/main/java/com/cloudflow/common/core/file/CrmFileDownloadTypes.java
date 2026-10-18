package com.cloudflow.common.core.file;

import java.util.Set;

/** CRM 原存储下载专用类型，不能用于预览。 */
public final class CrmFileDownloadTypes {
    public static final Set<String> ALL = Set.of("CRM_EMAIL_ATTACHMENT", "CRM_PORTAL_TICKET");
    private CrmFileDownloadTypes() { }
}
