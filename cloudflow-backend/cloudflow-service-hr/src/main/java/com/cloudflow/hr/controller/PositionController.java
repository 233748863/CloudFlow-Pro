package com.cloudflow.hr.controller;

import com.cloudflow.common.core.domain.R;
import com.cloudflow.hr.domain.dto.PositionCreateDTO;
import com.cloudflow.hr.domain.dto.PositionQueryDTO;
import com.cloudflow.hr.domain.dto.PositionUpdateDTO;
import com.cloudflow.hr.domain.vo.PositionDetailVO;
import com.cloudflow.hr.domain.vo.PositionVO;
import com.cloudflow.hr.service.PositionService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * 职位管理Controller
 * 
 * @author CloudFlow
 * @since 2026-03-20
 */
@Slf4j
@RestController
@RequestMapping("/position")
@RequiredArgsConstructor
public class PositionController {
    
    private final PositionService positionService;
    
    /**
     * 创建职位
     * 
     * @param dto 职位创建DTO
     * @return 职位ID
     */
    @PostMapping
    public R<Long> createPosition(@Validated @RequestBody PositionCreateDTO dto) {
        log.info("接收创建职位请求，职位编码：{}", dto.getPositionCode());
        Long id = positionService.createPosition(dto);
        return R.ok(id);
    }
    
    /**
     * 更新职位
     * 
     * @param id 职位ID
     * @param dto 职位更新DTO
     * @return 操作结果
     */
    @PutMapping("/{id}")
    public R<Void> updatePosition(@PathVariable Long id, 
                                       @Validated @RequestBody PositionUpdateDTO dto) {
        log.info("接收更新职位请求，职位ID：{}", id);
        positionService.updatePosition(id, dto);
        return R.ok();
    }
    
    /**
     * 查询职位详情
     * 
     * @param id 职位ID
     * @return 职位详情
     */
    @GetMapping("/{id}")
    public R<PositionDetailVO> getPosition(@PathVariable Long id) {
        log.info("接收查询职位详情请求，职位ID：{}", id);
        PositionDetailVO detailVO = positionService.getPosition(id);
        return R.ok(detailVO);
    }
    
    /**
     * 查询职位列表
     * 
     * @param query 查询条件
     * @return 职位列表
     */
    @GetMapping("/list")
    public R<List<PositionVO>> listPositions(PositionQueryDTO query) {
        log.info("接收查询职位列表请求，查询条件：{}", query);
        List<PositionVO> list = positionService.listPositions(query);
        return R.ok(list);
    }
    
    /**
     * 删除职位
     * 
     * @param id 职位ID
     * @return 操作结果
     */
    @DeleteMapping("/{id}")
    public R<Void> deletePosition(@PathVariable Long id) {
        log.info("接收删除职位请求，职位ID：{}", id);
        positionService.deletePosition(id);
        return R.ok();
    }
}
