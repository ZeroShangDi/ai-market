package cn.iocoder.yudao.module.callphone.controller.admin.settings;

import cn.iocoder.yudao.framework.common.pojo.CommonResult;
import cn.iocoder.yudao.framework.common.pojo.PageResult;
import cn.iocoder.yudao.framework.common.util.object.BeanUtils;
import cn.iocoder.yudao.module.callphone.service.settings.CallPhoneDictionaryBoundaryPolicy;
import cn.iocoder.yudao.module.system.controller.admin.dict.vo.data.DictDataPageReqVO;
import cn.iocoder.yudao.module.system.controller.admin.dict.vo.data.DictDataRespVO;
import cn.iocoder.yudao.module.system.controller.admin.dict.vo.data.DictDataSaveReqVO;
import cn.iocoder.yudao.module.system.controller.admin.dict.vo.type.DictTypeSaveReqVO;
import cn.iocoder.yudao.module.system.controller.admin.dict.vo.type.DictTypeSimpleRespVO;
import cn.iocoder.yudao.module.system.dal.dataobject.dict.DictDataDO;
import cn.iocoder.yudao.module.system.service.dict.DictDataService;
import cn.iocoder.yudao.module.system.service.dict.DictTypeService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.annotation.Resource;
import jakarta.validation.Valid;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

import java.util.List;

import static cn.iocoder.yudao.framework.common.exception.util.ServiceExceptionUtil.exception;
import static cn.iocoder.yudao.framework.common.pojo.CommonResult.success;
import static cn.iocoder.yudao.module.callphone.enums.ErrorCodeConstants.BUSINESS_DICTIONARY_ITEM_NOT_FOUND;

@Tag(name = "管理后台 - Call Phone 业务字典")
@RestController
@RequestMapping("/callphone/dictionary")
@Validated
public class BusinessDictionaryController {

    @Resource
    private DictTypeService dictTypeService;
    @Resource
    private DictDataService dictDataService;

    @GetMapping("/type/list")
    @Operation(summary = "查询 Call Phone 业务字典类型")
    @PreAuthorize("@ss.hasPermission('callphone:dictionary:list')")
    public CommonResult<List<DictTypeSimpleRespVO>> listTypes() {
        List<DictTypeSimpleRespVO> types = dictTypeService.getDictTypeList().stream()
                .filter(type -> CallPhoneDictionaryBoundaryPolicy.isCallPhoneType(type.getType()))
                .map(type -> BeanUtils.toBean(type, DictTypeSimpleRespVO.class))
                .toList();
        return success(types);
    }

    @PostMapping("/type/create")
    @Operation(summary = "创建 Call Phone 业务字典类型")
    @PreAuthorize("@ss.hasPermission('callphone:dictionary:manage')")
    public CommonResult<Long> createType(@RequestBody @Valid DictTypeSaveReqVO reqVO) {
        CallPhoneDictionaryBoundaryPolicy.requireCallPhoneType(reqVO.getType());
        reqVO.setId(null);
        return success(dictTypeService.createDictType(reqVO));
    }

    @GetMapping("/data/page")
    @Operation(summary = "分页查询 Call Phone 业务字典选项")
    @PreAuthorize("@ss.hasPermission('callphone:dictionary:list')")
    public CommonResult<PageResult<DictDataRespVO>> pageData(@Valid DictDataPageReqVO reqVO) {
        CallPhoneDictionaryBoundaryPolicy.requireCallPhoneType(reqVO.getDictType());
        PageResult<DictDataDO> page = dictDataService.getDictDataPage(reqVO);
        return success(BeanUtils.toBean(page, DictDataRespVO.class));
    }

    @PostMapping("/data/create")
    @Operation(summary = "创建 Call Phone 业务字典选项")
    @PreAuthorize("@ss.hasPermission('callphone:dictionary:manage')")
    public CommonResult<Long> createData(@RequestBody @Valid DictDataSaveReqVO reqVO) {
        CallPhoneDictionaryBoundaryPolicy.requireCallPhoneType(reqVO.getDictType());
        reqVO.setId(null);
        return success(dictDataService.createDictData(reqVO));
    }

    @PutMapping("/data/update")
    @Operation(summary = "更新 Call Phone 业务字典选项")
    @PreAuthorize("@ss.hasPermission('callphone:dictionary:manage')")
    public CommonResult<Boolean> updateData(@RequestBody @Valid DictDataSaveReqVO reqVO) {
        DictDataDO existing = reqVO.getId() == null ? null : dictDataService.getDictData(reqVO.getId());
        if (existing == null) {
            throw exception(BUSINESS_DICTIONARY_ITEM_NOT_FOUND);
        }
        CallPhoneDictionaryBoundaryPolicy.requireCallPhoneItem(existing, reqVO.getId(), reqVO.getDictType());
        dictDataService.updateDictData(reqVO);
        return success(true);
    }

}
