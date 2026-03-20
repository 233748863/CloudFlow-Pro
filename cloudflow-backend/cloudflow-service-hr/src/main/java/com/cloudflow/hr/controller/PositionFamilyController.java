package com.cloudflow.hr.controller;

import com.cloudflow.common.core.domain.R;
import com.cloudflow.hr.domain.dto.PositionFamilyCreateDTO;
import com.cloudflow.hr.domain.dto.PositionFamilyUpdateDTO;
import com.cloudflow.hr.domain.vo.PositionFamilyVO;
import com.cloudflow.hr.service.PositionFamilyService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * 职位族管理控制器
 * 
 * @author CloudFlow
 */
@Slf4j
@RestController
@RequestMapping("/api/hr/position-family")
@RequiredArgsConstructor
public class PositionFamilyController {
    
    private final PositionFamilyService positionFamilyService;
    
    /**
     * 创建职位族
     * 
     * @param dto 职位族创建DTO
     * @return 职位族ID
     */
    @PostMapping
    public R<Long> createPositionFamily(@Validated @RequestBody PositionFamilyCreateDTO dto) {
        log.info("接收创建职位族请求，familyCode: {}", dto.getFamilyCode());
        Long id = positionFamilyService.createPositionFamily(dto);
        return R.ok(id);
    }
    
    /**
     * 更新职位族
     * 
     * @param id 职位族ID
     * @param dto 职位族更新DTO
     * @return 操作结果
     */
    @PutMapping("/{id}")
    public R<Void> updatePositionFamily(@PathVariable Long id, 
                                             @Validated @RequestBody PositionFamilyUpdateDTO dto) {
        log.info("接收更新职位族请求，ID: {}", id);
        positionFamilyService.updatePositionFamily(id, dto);
        return R.ok();
    }
    
    /**
     * 获取职位族详情
     * 
     * @param id 职位族ID
     * @return 职位族VO
     */
    @GetMapping("/{id}")
    public R<PositionFamilyVO> getPositionFamily(@PathVariable Long id) {
        log.info("接收获取职位族详情请求，ID: {}", id);
        PositionFamilyVO vo = positionFamilyService.getPositionFamily(id);
        return R.ok(vo);
    }
    
    /**
     * 获取所有职位族列表
     * 
     * @return 职位族列表
     */
    @GetMapping("/list")
    public R<List<PositionFamilyVO>> listPositionFamilies() {
        log.info("接收获取职位族列表请求");
        List<PositionFamilyVO> list = positionFamilyService.listPositionFamilies();
        return R.ok(list);
    }
    
    /**
     * 删除职位族
     * 
     * @param id 职位族ID
     * @return 操作结果
     */
    @DeleteMapping("/{id}")
    public R<Void> deletePositionFamily(@PathVariable Long id) {
        log.info("接收删除职位族请求，ID: {}", id);
        positionFamilyService.deletePositionFamily(id);
        return R.ok();
    }
}
