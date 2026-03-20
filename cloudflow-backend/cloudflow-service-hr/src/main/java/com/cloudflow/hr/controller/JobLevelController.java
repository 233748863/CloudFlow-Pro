package com.cloudflow.hr.controller;

import com.cloudflow.common.core.domain.R;
import com.cloudflow.hr.domain.dto.JobLevelCreateDTO;
import com.cloudflow.hr.domain.dto.JobLevelUpdateDTO;
import com.cloudflow.hr.domain.vo.JobLevelVO;
import com.cloudflow.hr.service.JobLevelService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * 职级管理控制器
 * 
 * @author CloudFlow
 */
@Slf4j
@RestController
@RequestMapping("/api/hr/job-level")
@RequiredArgsConstructor
public class JobLevelController {
    
    private final JobLevelService jobLevelService;
    
    /**
     * 创建职级
     * 
     * @param dto 职级创建DTO
     * @return 职级ID
     */
    @PostMapping
    public R<Long> createJobLevel(@Validated @RequestBody JobLevelCreateDTO dto) {
        log.info("接收创建职级请求，levelCode: {}", dto.getLevelCode());
        Long id = jobLevelService.createJobLevel(dto);
        return R.ok(id);
    }
    
    /**
     * 更新职级
     * 
     * @param id 职级ID
     * @param dto 职级更新DTO
     * @return 操作结果
     */
    @PutMapping("/{id}")
    public R<Void> updateJobLevel(@PathVariable Long id, 
                                       @Validated @RequestBody JobLevelUpdateDTO dto) {
        log.info("接收更新职级请求，ID: {}", id);
        jobLevelService.updateJobLevel(id, dto);
        return R.ok();
    }
    
    /**
     * 获取职级详情
     * 
     * @param id 职级ID
     * @return 职级VO
     */
    @GetMapping("/{id}")
    public R<JobLevelVO> getJobLevel(@PathVariable Long id) {
        log.info("接收获取职级详情请求，ID: {}", id);
        JobLevelVO vo = jobLevelService.getJobLevel(id);
        return R.ok(vo);
    }
    
    /**
     * 获取职级列表
     * 
     * @param levelSeries 职级序列（可选，P-专业序列、M-管理序列）
     * @return 职级列表
     */
    @GetMapping("/list")
    public R<List<JobLevelVO>> listJobLevels(@RequestParam(required = false) String levelSeries) {
        log.info("接收获取职级列表请求，levelSeries: {}", levelSeries);
        List<JobLevelVO> list = jobLevelService.listJobLevels(levelSeries);
        return R.ok(list);
    }
    
    /**
     * 删除职级
     * 
     * @param id 职级ID
     * @return 操作结果
     */
    @DeleteMapping("/{id}")
    public R<Void> deleteJobLevel(@PathVariable Long id) {
        log.info("接收删除职级请求，ID: {}", id);
        jobLevelService.deleteJobLevel(id);
        return R.ok();
    }
}
