package com.cloudflow.hr.service;

import com.cloudflow.hr.domain.vo.talent.HrTalentArchiveVO;

/**
 * HR 人才档案聚合查询接口。
 *
 * <p>聚合单员工的：历次盘点参与记录、所在人才池、培养行动时间线、继任提名记录。
 * 纯查询，不引入新表。
 */
public interface IHrTalentArchiveService {

    HrTalentArchiveVO getArchive(Long employeeId);

    HrTalentArchiveVO getMyArchive();
}
