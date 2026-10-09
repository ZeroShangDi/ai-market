package cn.iocoder.yudao.module.callphone.controller.admin.customer;

import cn.hutool.core.util.IdUtil;
import cn.hutool.json.JSONArray;
import cn.hutool.json.JSONUtil;
import cn.iocoder.yudao.framework.apilog.core.annotation.ApiAccessLog;
import cn.iocoder.yudao.framework.common.biz.system.permission.PermissionCommonApi;
import cn.iocoder.yudao.framework.common.pojo.CommonResult;
import cn.iocoder.yudao.module.callphone.controller.admin.customer.vo.CustomerFieldRespVO;
import cn.iocoder.yudao.module.callphone.controller.admin.customer.vo.CustomerFieldSaveReqVO;
import cn.iocoder.yudao.module.callphone.controller.admin.customer.vo.CustomerFieldStatusReqVO;
import cn.iocoder.yudao.module.callphone.dal.dataobject.outbound.CustomerFieldDO;
import cn.iocoder.yudao.module.callphone.dal.mysql.outbound.CustomerFieldMapper;
import cn.iocoder.yudao.module.callphone.enums.ErrorCodeConstants;
import cn.iocoder.yudao.module.callphone.service.customer.CustomerFieldCompatibilityPolicy;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.annotation.Resource;
import jakarta.validation.Valid;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Objects;

import static cn.iocoder.yudao.framework.common.exception.util.ServiceExceptionUtil.exception;
import static cn.iocoder.yudao.framework.common.pojo.CommonResult.success;
import static cn.iocoder.yudao.framework.security.core.util.SecurityFrameworkUtils.getLoginUserId;

@Tag(name = "管理后台 - Call Phone 客户字段")
@RestController
@RequestMapping("/callphone/customer-field")
@Validated
public class CustomerFieldController {
    private static final List<String> OPTION_TYPES = List.of("select", "multi_select");

    @Resource private CustomerFieldMapper fieldMapper;
    @Resource private PermissionCommonApi permissionCommonApi;

    @GetMapping("/list")
    @Operation(summary = "查询客户字段配置")
    @PreAuthorize("@ss.hasPermission('callphone:customer:field:list')")
    public CommonResult<List<CustomerFieldRespVO>> list() {
        return success(fieldMapper.selectAllOrdered().stream().map(this::toResp).toList());
    }

    @GetMapping("/options")
    @Operation(summary = "查询当前用户可用的客户字段")
    @PreAuthorize("@ss.hasPermission('callphone:customer:list')")
    public CommonResult<List<CustomerFieldRespVO>> options() {
        Long userId = getLoginUserId();
        return success(fieldMapper.selectEnabledOrdered().stream().filter(field -> isVisibleTo(field, userId))
                .map(this::toResp).toList());
    }

    @PostMapping("/save")
    @ApiAccessLog(requestEnable = false)
    @Operation(summary = "新增或修改客户字段配置")
    @PreAuthorize("@ss.hasPermission('callphone:customer:field:save')")
    public CommonResult<Long> save(@RequestBody @Valid CustomerFieldSaveReqVO reqVO) {
        validateOptions(reqVO);
        CustomerFieldDO existing = reqVO.getId() == null ? null : fieldMapper.selectById(reqVO.getId());
        if (reqVO.getId() != null && existing == null) return success(null);
        if (existing != null) {
            CustomerFieldCompatibilityPolicy.validateUpdate(existing, reqVO.getValueType(), reqVO.getOptionsJson());
        }
        CustomerFieldDO duplicate = fieldMapper.selectByFieldKey(reqVO.getFieldKey());
        if (duplicate != null && !Objects.equals(duplicate.getId(), reqVO.getId())) {
            throw exception(ErrorCodeConstants.CUSTOMER_FIELD_KEY_DUPLICATED);
        }
        CustomerFieldDO field = existing;
        if (existing != null && !Objects.equals(field.getFieldKey(), reqVO.getFieldKey())) {
            throw exception(ErrorCodeConstants.CUSTOMER_FIELD_KEY_IMMUTABLE);
        }
        if (field == null) {
            field = new CustomerFieldDO();
            field.setId(IdUtil.getSnowflake().nextId());
        }
        field.setFieldKey(reqVO.getFieldKey());
        field.setLabel(reqVO.getLabel().trim());
        field.setValueType(reqVO.getValueType());
        field.setRequired(Boolean.TRUE.equals(reqVO.getRequired()));
        field.setOptionsJson(reqVO.getOptionsJson());
        field.setEnabled(reqVO.getEnabled() == null || reqVO.getEnabled());
        field.setListVisible(Boolean.TRUE.equals(reqVO.getListVisible()));
        field.setVisibleRoleCodesJson(reqVO.getVisibleRoleCodes() == null || reqVO.getVisibleRoleCodes().isEmpty()
                ? null : JSONUtil.toJsonStr(reqVO.getVisibleRoleCodes().stream().distinct().toList()));
        field.setSort(reqVO.getSort() == null ? 100 : reqVO.getSort());
        if (reqVO.getId() == null) fieldMapper.insert(field); else fieldMapper.updateById(field);
        return success(field.getId());
    }

    @PostMapping("/status")
    @Operation(summary = "启用或停用客户字段")
    @PreAuthorize("@ss.hasPermission('callphone:customer:field:save')")
    public CommonResult<Boolean> updateStatus(@RequestBody @Valid CustomerFieldStatusReqVO reqVO) {
        CustomerFieldDO field = fieldMapper.selectById(reqVO.getId());
        if (field == null) return success(false);
        field.setEnabled(reqVO.getEnabled());
        fieldMapper.updateById(field);
        return success(true);
    }

    private void validateOptions(CustomerFieldSaveReqVO reqVO) {
        if (!OPTION_TYPES.contains(reqVO.getValueType())) {
            if (reqVO.getOptionsJson() != null && !reqVO.getOptionsJson().isBlank()) {
                throw exception(ErrorCodeConstants.CUSTOMER_FIELD_OPTIONS_INVALID);
            }
            return;
        }
        try {
            JSONArray options = JSONUtil.parseArray(reqVO.getOptionsJson());
            if (options.isEmpty() || options.stream().anyMatch(item -> !(item instanceof String) || ((String) item).isBlank())
                    || options.stream().map(String::valueOf).distinct().count() != options.size()) {
                throw exception(ErrorCodeConstants.CUSTOMER_FIELD_OPTIONS_INVALID);
            }
        } catch (Exception parseError) {
            throw exception(ErrorCodeConstants.CUSTOMER_FIELD_OPTIONS_INVALID);
        }
    }

    private CustomerFieldRespVO toResp(CustomerFieldDO field) {
        CustomerFieldRespVO resp = new CustomerFieldRespVO();
        resp.setId(field.getId()); resp.setFieldKey(field.getFieldKey()); resp.setLabel(field.getLabel());
        resp.setValueType(field.getValueType()); resp.setRequired(field.getRequired()); resp.setOptionsJson(field.getOptionsJson());
        resp.setEnabled(field.getEnabled()); resp.setListVisible(field.getListVisible()); resp.setSort(field.getSort());
        resp.setVisibleRoleCodes(parseRoleCodes(field.getVisibleRoleCodesJson()));
        resp.setCreateTime(field.getCreateTime()); resp.setUpdateTime(field.getUpdateTime());
        return resp;
    }

    private boolean isVisibleTo(CustomerFieldDO field, Long userId) {
        List<String> roleCodes = parseRoleCodes(field.getVisibleRoleCodesJson());
        return roleCodes.isEmpty() || permissionCommonApi.hasAnyRoles(userId, roleCodes.toArray(String[]::new));
    }

    private List<String> parseRoleCodes(String value) {
        if (value == null || value.isBlank()) return List.of();
        try {
            JSONArray roleCodes = JSONUtil.parseArray(value);
            if (roleCodes.stream().anyMatch(item -> !(item instanceof String))) return List.of("__invalid__");
            return roleCodes.stream().map(String::valueOf).distinct().toList();
        } catch (Exception parseError) {
            return List.of("__invalid__");
        }
    }
}
