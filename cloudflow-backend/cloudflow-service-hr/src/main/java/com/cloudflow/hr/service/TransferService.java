package com.cloudflow.hr.service;

import com.cloudflow.hr.domain.dto.TransferApplicationCreateDTO;
import com.cloudflow.hr.domain.vo.TransferApplicationVO;

import java.util.List;

/**
 * 调岗申请服务接口
 */
public interface TransferService {

    /**
     * 创建调岗申请
     *
     * @param dto 创建DTO
     * @return 申请ID
     */
    Long createTransferApplication(TransferApplicationCreateDTO dto);

    /**
     * 提交调岗申请
     *
     * @param id 申请ID
     */
    void submitTransferApplication(Long id);

    /**
     * 审批通过调岗申请
     *
     * @param id 申请ID
     */
    void approveTransfer(Long id);

    /**
     * 审批拒绝调岗申请
     *
     * @param id 申请ID
     */
    void rejectTransfer(Long id);

    /**
     * 调岗生效
     *
     * @param id 申请ID
     */
    void effectiveTransfer(Long id);

    /**
     * 查询调岗申请详情
     *
     * @param id 申请ID
     * @return 调岗申请VO
     */
    TransferApplicationVO getTransferApplication(Long id);

    /**
     * 查询员工的调岗申请列表
     *
     * @param employeeId 员工ID
     * @return 调岗申请列表
     */
    List<TransferApplicationVO> listByEmployeeId(Long employeeId);
}
