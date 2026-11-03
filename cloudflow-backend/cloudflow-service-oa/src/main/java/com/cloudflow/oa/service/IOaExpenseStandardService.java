package com.cloudflow.oa.service;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.oa.domain.BizExpenseClaim;
import com.cloudflow.oa.domain.OaExpenseStandard;
import com.cloudflow.oa.domain.vo.OaExpenseExceedResultVO;

import java.util.List;

/**
 * OA-P0-3 费用标准管理 + 超标校验。
 */
public interface IOaExpenseStandardService {

    Page<OaExpenseStandard> page(String keyword, String positionLevel, String category, String city, String status,
                                 Integer pageNum, Integer pageSize);

    List<OaExpenseStandard> listActive();

    OaExpenseStandard getById(Long standardId);

    boolean save(OaExpenseStandard standard);

    boolean update(OaExpenseStandard standard);

    boolean remove(Long standardId);

    /** 按每笔发生城市与日期匹配各周期标准，累计同申请人已提交、已通过、已付款费用。 */
    OaExpenseExceedResultVO validateExceed(BizExpenseClaim claim);
}
