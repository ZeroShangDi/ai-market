package cn.iocoder.yudao.module.callphone.controller.admin.acquisition;

import cn.iocoder.yudao.framework.common.pojo.CommonResult;
import cn.iocoder.yudao.framework.common.pojo.PageResult;
import cn.iocoder.yudao.framework.common.util.object.BeanUtils;
import cn.iocoder.yudao.module.callphone.controller.admin.acquisition.vo.PosterCompositionPageReqVO;
import cn.iocoder.yudao.module.callphone.controller.admin.acquisition.vo.PosterCompositionRespVO;
import cn.iocoder.yudao.module.callphone.controller.admin.acquisition.vo.PosterCompositionSaveReqVO;
import cn.iocoder.yudao.module.callphone.dal.dataobject.acquisition.PosterCompositionDO;
import cn.iocoder.yudao.module.callphone.service.acquisition.PosterCompositionService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.annotation.Resource;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Pattern;
import java.util.List;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import static cn.iocoder.yudao.framework.common.pojo.CommonResult.success;

@Tag(name = "管理后台 - Call Phone 组合海报")
@RestController
@RequestMapping("/callphone/poster-composition")
@Validated
public class PosterCompositionController {

    @Resource private PosterCompositionService posterService;

    @GetMapping("/page")
    @Operation(summary = "组合海报分页")
    @PreAuthorize("@ss.hasPermission('callphone:acquisition:poster:list')")
    public CommonResult<PageResult<PosterCompositionRespVO>> getPage(@Valid PosterCompositionPageReqVO reqVO) {
        PageResult<PosterCompositionDO> page = posterService.getPage(reqVO);
        List<PosterCompositionRespVO> rows = page.getList().stream()
                .map(row -> BeanUtils.toBean(row, PosterCompositionRespVO.class)).toList();
        return success(new PageResult<>(rows, page.getTotal()));
    }

    @PostMapping("/save")
    @Operation(summary = "新建或编辑组合海报")
    @PreAuthorize("@ss.hasPermission('callphone:acquisition:poster:manage')")
    public CommonResult<Long> save(@Valid @RequestBody PosterCompositionSaveReqVO reqVO) {
        return success(posterService.save(reqVO));
    }

    @PutMapping("/status")
    @Operation(summary = "启用或停用组合海报")
    @PreAuthorize("@ss.hasPermission('callphone:acquisition:poster:manage')")
    public CommonResult<Boolean> setStatus(@RequestParam("id") Long id,
                                           @RequestParam("status") @Pattern(regexp = "^(active|disabled)$") String status) {
        return success(posterService.setStatus(id, status));
    }

}
