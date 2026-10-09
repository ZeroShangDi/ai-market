package cn.iocoder.yudao.module.callphone.controller.admin.customer;

import cn.hutool.core.util.IdUtil;
import cn.iocoder.yudao.framework.common.pojo.CommonResult;
import cn.iocoder.yudao.framework.common.pojo.PageResult;
import cn.iocoder.yudao.framework.apilog.core.annotation.ApiAccessLog;
import cn.iocoder.yudao.framework.mybatis.core.query.LambdaQueryWrapperX;
import cn.iocoder.yudao.module.callphone.controller.admin.customer.vo.CustomerPageReqVO;
import cn.iocoder.yudao.module.callphone.controller.admin.customer.vo.CustomerRespVO;
import cn.iocoder.yudao.module.callphone.controller.admin.customer.vo.CustomerSaveReqVO;
import cn.iocoder.yudao.module.callphone.controller.admin.customer.vo.CustomerImportReqVO;
import cn.iocoder.yudao.module.callphone.controller.admin.customer.vo.CustomerImportRespVO;
import cn.iocoder.yudao.module.callphone.controller.admin.customer.vo.CustomerBatchAssignReqVO;
import cn.iocoder.yudao.module.callphone.controller.admin.customer.vo.CustomerBatchTagsReqVO;
import cn.iocoder.yudao.module.callphone.controller.admin.customer.vo.CustomerStageHistoryPageReqVO;
import cn.iocoder.yudao.module.callphone.controller.admin.customer.vo.CustomerStageHistoryRespVO;
import cn.iocoder.yudao.module.callphone.dal.dataobject.outbound.CustomerDO;
import cn.iocoder.yudao.module.callphone.dal.dataobject.outbound.CustomerStageEventDO;
import cn.iocoder.yudao.module.callphone.dal.dataobject.outbound.CustomerFieldDO;
import cn.iocoder.yudao.module.callphone.dal.mysql.outbound.CustomerMapper;
import cn.iocoder.yudao.module.callphone.dal.mysql.outbound.CustomerStageEventMapper;
import cn.iocoder.yudao.module.callphone.dal.dataobject.outbound.CustomerStageDO;
import cn.iocoder.yudao.module.callphone.dal.mysql.outbound.CustomerStageMapper;
import cn.iocoder.yudao.module.callphone.service.security.PiiCryptoService;
import cn.iocoder.yudao.module.callphone.service.customer.CustomerCustomFieldService;
import cn.iocoder.yudao.module.callphone.service.customer.CustomerImportService;
import cn.iocoder.yudao.module.callphone.service.customer.CustomerBatchManagementService;
import cn.iocoder.yudao.module.system.api.user.AdminUserApi;
import cn.iocoder.yudao.module.system.api.user.dto.AdminUserRespDTO;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.annotation.Resource;
import jakarta.validation.Valid;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.validation.annotation.Validated;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.Objects;
import java.util.stream.Collectors;

import static cn.iocoder.yudao.framework.common.pojo.CommonResult.success;
import static cn.iocoder.yudao.framework.common.exception.util.ServiceExceptionUtil.exception;
import static cn.iocoder.yudao.framework.security.core.util.SecurityFrameworkUtils.getLoginUserId;

@Tag(name = "管理后台 - Call Phone 客户")
@RestController
@RequestMapping("/callphone/customer")
@Validated
public class CustomerController {
    @Resource private CustomerMapper customerMapper;
    @Resource private CustomerStageEventMapper stageEventMapper;
    @Resource private CustomerStageMapper customerStageMapper;
    @Resource private PiiCryptoService piiCryptoService;
    @Resource private CustomerCustomFieldService customFieldService;
    @Resource private AdminUserApi adminUserApi;
    @Resource private CustomerImportService customerImportService;
    @Resource private CustomerBatchManagementService customerBatchManagementService;

    @GetMapping("/page")
    @Operation(summary = "客户列表分页")
    @PreAuthorize("@ss.hasPermission('callphone:customer:list')")
    public CommonResult<PageResult<CustomerRespVO>> page(@Valid CustomerPageReqVO reqVO) {
        PageResult<CustomerDO> page = customerMapper.selectPage(reqVO);
        List<CustomerFieldDO> listFields = customFieldService.getVisibleListFields(getLoginUserId());
        List<CustomerRespVO> rows = page.getList().stream().map(customer -> toResp(customer, false, listFields)).toList();
        Map<Long, AdminUserRespDTO> users = adminUserApi.getUserMap(rows.stream()
                .map(CustomerRespVO::getOwnerUserId).filter(Objects::nonNull).collect(Collectors.toSet()));
        rows.forEach(row -> {
            AdminUserRespDTO user = users.get(row.getOwnerUserId());
            if (user != null) row.setOwnerName(user.getNickname());
        });
        return success(new PageResult<>(rows, page.getTotal()));
    }

    @GetMapping("/get")
    @Operation(summary = "获取数据范围内的客户详情")
    @PreAuthorize("@ss.hasPermission('callphone:customer:list')")
    public CommonResult<CustomerRespVO> get(@RequestParam("id") Long id) {
        CustomerDO customer = customerMapper.selectById(id);
        if (customer == null) return success(null);
        CustomerRespVO resp = toResp(customer, true, List.of());
        if (customer.getOwnerUserId() != null) {
            AdminUserRespDTO owner = adminUserApi.getUser(customer.getOwnerUserId());
            if (owner != null) resp.setOwnerName(owner.getNickname());
        }
        return success(resp);
    }

    @GetMapping("/stage-history")
    @Operation(summary = "本人客户阶段变更记录")
    @PreAuthorize("@ss.hasPermission('callphone:customer:list')")
    public CommonResult<PageResult<CustomerStageHistoryRespVO>> stageHistory(@Valid CustomerStageHistoryPageReqVO reqVO) {
        PageResult<CustomerStageEventDO> page = stageEventMapper.selectPage(reqVO, getLoginUserId());
        Set<Long> customerIds = page.getList().stream().map(CustomerStageEventDO::getCustomerId).collect(Collectors.toSet());
        Map<Long, CustomerDO> customers = customerIds.isEmpty() ? Map.of() : customerMapper.selectList(
                new LambdaQueryWrapperX<CustomerDO>().in(CustomerDO::getId, customerIds)
                        .eq(CustomerDO::getOwnerUserId, getLoginUserId())).stream()
                .collect(Collectors.toMap(CustomerDO::getId, customer -> customer));
        List<CustomerStageHistoryRespVO> rows = page.getList().stream().map(event -> {
            CustomerStageHistoryRespVO vo = new CustomerStageHistoryRespVO();
            vo.setId(event.getId());
            vo.setCustomerId(event.getCustomerId());
            CustomerDO customer = customers.get(event.getCustomerId());
            vo.setCustomerName(customer == null ? "已归档客户" : piiCryptoService.decrypt(customer.getNameCiphertext()));
            vo.setFromStage(event.getFromStage());
            vo.setFromStageName(stageName(event.getFromStage()));
            vo.setToStage(event.getToStage());
            vo.setToStageName(stageName(event.getToStage()));
            vo.setChangedAt(event.getChangedAt());
            vo.setSource(event.getSource());
            return vo;
        }).toList();
        return success(new PageResult<>(rows, page.getTotal()));
    }

    @PostMapping("/save")
    @ApiAccessLog(requestEnable = false)
    @Transactional(rollbackFor = Exception.class)
    @Operation(summary = "新增或修改客户")
    @PreAuthorize("@ss.hasPermission('callphone:customer:save')")
    public CommonResult<Long> save(@RequestBody @Valid CustomerSaveReqVO reqVO) {
        boolean creating = reqVO.getId() == null;
        CustomerDO customer = reqVO.getId() == null ? new CustomerDO() : customerMapper.selectById(reqVO.getId());
        if (customer == null) {
            return success(null);
        }
        customer.setNameCiphertext(piiCryptoService.encrypt(reqVO.getName().trim()));
        if (reqVO.getPhone() != null && !reqVO.getPhone().isBlank()) {
            String phone = reqVO.getPhone().replaceAll("[ -]", "");
            customer.setPhoneCiphertext(piiCryptoService.encrypt(phone));
            customer.setPhoneDisplay(maskPhone(phone));
        } else if (reqVO.getId() == null) {
            throw exception(cn.iocoder.yudao.module.callphone.enums.ErrorCodeConstants.CUSTOMER_PHONE_REQUIRED);
        }
        String stageCode = reqVO.getStage() == null || reqVO.getStage().isBlank() ? "new" : reqVO.getStage();
        CustomerStageDO configuredStage = customerStageMapper.selectByCode(stageCode);
        if (configuredStage != null && !Boolean.TRUE.equals(configuredStage.getEnabled())) {
            throw exception(cn.iocoder.yudao.module.callphone.enums.ErrorCodeConstants.CUSTOMER_STAGE_INVALID);
        }
        if (configuredStage == null && !java.util.Set.of("new", "following", "converted", "paused").contains(stageCode)) {
            throw exception(cn.iocoder.yudao.module.callphone.enums.ErrorCodeConstants.CUSTOMER_STAGE_INVALID);
        }
        String previousStage = customer.getStage();
        customer.setStage(stageCode);
        customer.setSource(reqVO.getSource());
        customer.setTags(reqVO.getTags());
        customer.setCustomFieldsCiphertext(customFieldService.validateAndEncrypt(
                customer.getCustomFieldsCiphertext(), reqVO.getCustomFields(), getLoginUserId()));
        if (creating) {
            customer.setId(IdUtil.getSnowflake().nextId());
            customer.setOwnerUserId(getLoginUserId());
            customer.setStatus("active");
            customerMapper.insert(customer);
        } else {
            customerMapper.updateById(customer);
        }
        if (creating || !Objects.equals(previousStage, stageCode)) {
            CustomerStageEventDO event = new CustomerStageEventDO();
            event.setId(IdUtil.getSnowflake().nextId());
            event.setCustomerId(customer.getId());
            event.setFromStage(creating ? null : previousStage);
            event.setToStage(stageCode);
            event.setChangedBy(getLoginUserId());
            event.setChangedAt(java.time.LocalDateTime.now(java.time.ZoneOffset.UTC));
            event.setSource(creating ? "customer_created" : "customer_edit");
            stageEventMapper.insert(event);
        }
        return success(customer.getId());
    }

    @PostMapping("/import")
    @ApiAccessLog(requestEnable = false)
    @Operation(summary = "逐行导入客户 CSV 数据")
    @PreAuthorize("@ss.hasPermission('callphone:customer:import')")
    public CommonResult<CustomerImportRespVO> importCustomers(@RequestBody @Valid CustomerImportReqVO reqVO) {
        return success(customerImportService.importRows(reqVO, getLoginUserId()));
    }

    @PostMapping("/assign-batch")
    @ApiAccessLog(requestEnable = false)
    @Operation(summary = "批量调整客户负责人")
    @PreAuthorize("@ss.hasPermission('callphone:customer:assign')")
    public CommonResult<Integer> assignBatch(@RequestBody @Valid CustomerBatchAssignReqVO reqVO) {
        return success(customerBatchManagementService.assignOwners(
                reqVO.getCustomerIds(), reqVO.getOwnerUserId(), getLoginUserId()));
    }

    @PostMapping("/tags-batch")
    @ApiAccessLog(requestEnable = false)
    @Operation(summary = "批量更新客户标签")
    @PreAuthorize("@ss.hasPermission('callphone:customer:tags')")
    public CommonResult<Integer> updateTagsBatch(@RequestBody @Valid CustomerBatchTagsReqVO reqVO) {
        return success(customerBatchManagementService.updateTags(
                reqVO.getCustomerIds(), reqVO.getMode(), reqVO.getTags()));
    }

    @PostMapping("/archive")
    @Operation(summary = "归档客户")
    @PreAuthorize("@ss.hasPermission('callphone:customer:archive')")
    public CommonResult<Boolean> archive(@RequestParam("id") Long id) {
        CustomerDO customer = customerMapper.selectById(id);
        if (customer == null) return success(false);
        customer.setStatus("archived");
        customerMapper.updateById(customer);
        return success(true);
    }

    private CustomerRespVO toResp(CustomerDO customer, boolean includeAllVisibleFields, List<CustomerFieldDO> listFields) {
        CustomerRespVO resp = new CustomerRespVO();
        resp.setId(customer.getId());
        resp.setName(piiCryptoService.decrypt(customer.getNameCiphertext()));
        resp.setPhoneDisplay(customer.getPhoneDisplay());
        resp.setStage(customer.getStage());
        resp.setSource(customer.getSource());
        resp.setTags(customer.getTags());
        resp.setOwnerUserId(customer.getOwnerUserId());
        resp.setCustomFields(includeAllVisibleFields
                ? customFieldService.getDetailValues(customer.getCustomFieldsCiphertext(), getLoginUserId())
                : customFieldService.getListValues(customer.getCustomFieldsCiphertext(), listFields));
        resp.setCreateTime(customer.getCreateTime());
        return resp;
    }

    private String maskPhone(String phone) {
        if (phone.length() <= 7) return "****";
        return phone.substring(0, 3) + " **** " + phone.substring(phone.length() - 4);
    }

    private String stageName(String stageCode) {
        if (stageCode == null) return "无";
        CustomerStageDO stage = customerStageMapper.selectByCode(stageCode);
        return stage == null ? stageCode : stage.getName();
    }
}
