package cn.joywon.poco.merchant.PlatformModule.controller;

import cn.joywon.poco.common.core.util.R;
import cn.joywon.poco.merchant.PlatformModule.dto.IndustryCreateDTO;
import cn.joywon.poco.merchant.PlatformModule.dto.IndustryQueryDTO;
import cn.joywon.poco.merchant.PlatformModule.dto.IndustryUpdateDTO;
import cn.joywon.poco.merchant.PlatformModule.entity.Industry;
import cn.joywon.poco.merchant.PlatformModule.service.IIndustryAdminService;
import cn.joywon.poco.merchant.PlatformModule.vo.IndustryVO;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springdoc.core.annotations.ParameterObject;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;


@RestController
@Validated
@RequiredArgsConstructor
@Tag(name = "行业分类管理(平台后台端)")
@RequestMapping("/platform/industry")
public class IndustryAdminController {

    private final IIndustryAdminService industryAdminService;

    /**
     * 添加行业
     *
     * @param dto 行业新增参数
     * @return 响应结果
     */
    @PostMapping("/add")
    @Operation(summary = "添加行业分类")
    public R<?> addIndustry(@RequestBody @Valid IndustryCreateDTO dto) {
        return industryAdminService.addIndustry(dto);
    }


    /**
     * 删除行业
     *
     * @param industryId 行业分类ID
     * @return 响应结果
     */
    @DeleteMapping("/{industryId}")
    @Operation(summary = "删除行业分类")
    public R<?> deleteIndustry(@PathVariable("industryId") Long industryId) {
        return industryAdminService.deleteIndustry(industryId);
    }


    /**
     * 更新行业
     *
     * @param dto 行业更新参数
     * @return 响应结果
     */
    @PutMapping("/update")
    @Operation(summary = "更新行业分类")
    public R<?> updateIndustry(@RequestBody @Valid IndustryUpdateDTO dto) {
        return industryAdminService.updateIndustry(dto);
    }


    /**
     * 获取行业分类列表（分页，支持多条件查询）
     *
     * @param page     分页对象（支持 current 和 size 参数）
     * @param queryDTO 查询条件（支持多字段筛选）
     * @return 响应结果(行业分类分页列表)
     */
    @GetMapping("/list")
    @Operation(summary = "获取行业分类列表（分页，支持多条件查询）")
    public R<IPage<IndustryVO>> getIndustryList(@ParameterObject Page<Industry> page,
                                                 @ParameterObject IndustryQueryDTO queryDTO) {
        return industryAdminService.getIndustryList(page, queryDTO);
    }


    /**
     * 根据ID获取行业分类
     *
     * @param industryId 行业分类ID
     * @return 响应结果(行业分类)
     */
    @GetMapping("/id/{industryId}")
    @Operation(summary = "根据行业分类ID获取行业分类详情")
    public R<IndustryVO> getById(@PathVariable("industryId") Long industryId) {
        return industryAdminService.getIndustryById(industryId);
    }

}