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

    /**
     * 对单据进行超标校验, 返回 {exceeded(bool), totalExceededAmount, details(List<Map>)}。
     * 命中规则按 (positionLevel,category,city) 精确 → (positionLevel,category,'') 通用城市 → null 顺序匹配。
     */
    OaExpenseExceedResultVO validateExceed(BizExpenseClaim claim, String applicantPositionLevel, String applicantCity);
}
