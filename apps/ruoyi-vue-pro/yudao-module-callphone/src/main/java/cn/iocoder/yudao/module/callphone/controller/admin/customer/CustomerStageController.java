package cn.iocoder.yudao.module.callphone.controller.admin.customer;

import cn.hutool.core.util.IdUtil;
import cn.iocoder.yudao.framework.common.pojo.CommonResult;
import cn.iocoder.yudao.framework.mybatis.core.query.LambdaQueryWrapperX;
import cn.iocoder.yudao.module.callphone.enums.ErrorCodeConstants;
import cn.iocoder.yudao.module.callphone.controller.admin.customer.vo.CustomerStageRespVO;
import cn.iocoder.yudao.module.callphone.controller.admin.customer.vo.CustomerStageSaveReqVO;
import cn.iocoder.yudao.module.callphone.dal.dataobject.outbound.CustomerDO;
import cn.iocoder.yudao.module.callphone.dal.dataobject.outbound.CustomerStageDO;
import cn.iocoder.yudao.module.callphone.dal.mysql.outbound.CustomerMapper;
import cn.iocoder.yudao.module.callphone.dal.mysql.outbound.CustomerStageMapper;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.annotation.Resource;
import org.springframework.dao.DuplicateKeyException;
import jakarta.validation.Valid;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Objects;

import static cn.iocoder.yudao.framework.common.pojo.CommonResult.success;
import static cn.iocoder.yudao.framework.common.exception.util.ServiceExceptionUtil.exception;
import static cn.iocoder.yudao.framework.security.core.util.SecurityFrameworkUtils.getLoginUserId;

@Tag(name = "管理后台 - Call Phone 客户阶段")
@RestController
@RequestMapping("/callphone/customer-stage")
@Validated
public class CustomerStageController {
    private static final List<DefaultStage> DEFAULTS = List.of(
            new DefaultStage("new", "新客户", "#3B82F6", 10),
            new DefaultStage("following", "跟进中", "#F59E0B", 20),
            new DefaultStage("converted", "已转化", "#10B981", 30),
            new DefaultStage("paused", "暂缓", "#94A3B8", 40));

    @Resource private CustomerStageMapper stageMapper;
    @Resource private CustomerMapper customerMapper;

    @GetMapping("/list")
    @Operation(summary = "客户阶段配置与客户数量")
    @PreAuthorize("@ss.hasPermission('callphone:customer:stage:list')")
    public CommonResult<List<CustomerStageRespVO>> list() {
        ensureDefaults();
        return success(selectAll().stream().map(this::toResp).toList());
    }

    @GetMapping("/options")
    @Operation(summary = "客户表单可用阶段选项")
    @PreAuthorize("@ss.hasPermission('callphone:customer:list')")
    public CommonResult<List<CustomerStageRespVO>> options() {
        ensureDefaults();
        List<CustomerStageDO> stages = stageMapper.selectEnabledOrdered();
        return success(stages.stream().map(this::toResp).toList());
    }

    @PostMapping("/save")
    @Operation(summary = "新增或修改客户阶段")
    @PreAuthorize("@ss.hasPermission('callphone:customer:stage:save')")
    @Transactional(rollbackFor = Exception.class)
    public CommonResult<Long> save(@RequestBody @Valid CustomerStageSaveReqVO reqVO) {
        CustomerStageDO stage;
        if (reqVO.getId() == null) {
            if (stageMapper.selectByCode(reqVO.getStageCode()) != null) {
                throw exception(ErrorCodeConstants.CUSTOMER_STAGE_CODE_DUPLICATED);
            }
            stage = new CustomerStageDO();
            stage.setId(IdUtil.getSnowflake().nextId()); stage.setStageCode(reqVO.getStageCode());
        } else {
            stage = stageMapper.selectById(reqVO.getId());
            if (stage == null) throw exception(ErrorCodeConstants.CUSTOMER_STAGE_NOT_FOUND);
            if (!Objects.equals(stage.getStageCode(), reqVO.getStageCode())) {
                throw exception(ErrorCodeConstants.CUSTOMER_STAGE_CODE_IMMUTABLE);
            }
        }
        if (Boolean.FALSE.equals(reqVO.getEnabled())) {
            if (Boolean.TRUE.equals(stage.getEnabled()) && stageMapper.selectEnabledForUpdate().size() <= 1) {
                throw exception(ErrorCodeConstants.CUSTOMER_STAGE_LAST_ENABLED);
            }
            if (countCustomers(stage.getStageCode()) > 0) {
                throw exception(ErrorCodeConstants.CUSTOMER_STAGE_IN_USE);
            }
        }
        stage.setName(reqVO.getName().trim()); stage.setColor(reqVO.getColor());
        stage.setSort(reqVO.getSort() == null ? 100 : reqVO.getSort());
        stage.setEnabled(reqVO.getEnabled() == null || reqVO.getEnabled());
        if (reqVO.getId() == null) {
            try {
                stageMapper.insert(stage);
            } catch (DuplicateKeyException duplicate) {
                throw exception(ErrorCodeConstants.CUSTOMER_STAGE_CODE_DUPLICATED);
            }
        } else {
            stageMapper.updateById(stage);
        }
        return success(stage.getId());
    }

    private void ensureDefaults() {
        for (DefaultStage item : DEFAULTS) {
            if (stageMapper.selectByCode(item.code()) != null) continue;
            CustomerStageDO stage = new CustomerStageDO();
            stage.setId(IdUtil.getSnowflake().nextId()); stage.setStageCode(item.code()); stage.setName(item.name());
            stage.setColor(item.color()); stage.setSort(item.sort()); stage.setEnabled(true); stage.setSystemDefault(true);
            try {
                stageMapper.insert(stage);
            } catch (DuplicateKeyException duplicate) {
                // Parallel first reads may initialize the same tenant defaults; accept only a confirmed code collision.
                if (stageMapper.selectByCode(item.code()) == null) throw duplicate;
            }
        }
    }

    private List<CustomerStageDO> selectAll() {
        return stageMapper.selectList(new LambdaQueryWrapperX<CustomerStageDO>()
                .orderByAsc(CustomerStageDO::getSort).orderByAsc(CustomerStageDO::getId));
    }

    private CustomerStageRespVO toResp(CustomerStageDO stage) {
        CustomerStageRespVO vo = new CustomerStageRespVO();
        vo.setId(stage.getId()); vo.setStageCode(stage.getStageCode()); vo.setName(stage.getName());
        vo.setColor(stage.getColor()); vo.setSort(stage.getSort()); vo.setEnabled(stage.getEnabled()); vo.setSystemDefault(stage.getSystemDefault());
        vo.setCustomerCount(countCustomers(stage.getStageCode()));
        return vo;
    }

    private long countCustomers(String stageCode) {
        return customerMapper.selectCount(new LambdaQueryWrapperX<CustomerDO>()
                .eq(CustomerDO::getStage, stageCode).eq(CustomerDO::getStatus, "active"));
    }

    private record DefaultStage(String code, String name, String color, int sort) { }
}
