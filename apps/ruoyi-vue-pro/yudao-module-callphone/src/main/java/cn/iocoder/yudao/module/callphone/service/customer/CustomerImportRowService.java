package cn.iocoder.yudao.module.callphone.service.customer;

import cn.hutool.core.util.IdUtil;
import cn.iocoder.yudao.module.callphone.controller.admin.customer.vo.CustomerImportRowReqVO;
import cn.iocoder.yudao.module.callphone.controller.admin.customer.vo.CustomerImportRowRespVO;
import cn.iocoder.yudao.module.callphone.dal.dataobject.outbound.CustomerDO;
import cn.iocoder.yudao.module.callphone.dal.dataobject.outbound.CustomerStageDO;
import cn.iocoder.yudao.module.callphone.dal.dataobject.outbound.CustomerStageEventDO;
import cn.iocoder.yudao.module.callphone.dal.mysql.outbound.CustomerMapper;
import cn.iocoder.yudao.module.callphone.dal.mysql.outbound.CustomerStageEventMapper;
import cn.iocoder.yudao.module.callphone.dal.mysql.outbound.CustomerStageMapper;
import cn.iocoder.yudao.module.callphone.enums.ErrorCodeConstants;
import cn.iocoder.yudao.module.callphone.service.customer.CustomerCustomFieldService;
import cn.iocoder.yudao.module.callphone.service.security.PiiCryptoService;
import jakarta.annotation.Resource;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.Map;
import java.util.Set;

import static cn.iocoder.yudao.framework.common.exception.util.ServiceExceptionUtil.exception;

@Service
public class CustomerImportRowService {
    @Resource private CustomerMapper customerMapper;
    @Resource private CustomerStageMapper customerStageMapper;
    @Resource private CustomerStageEventMapper stageEventMapper;
    @Resource private PiiCryptoService piiCryptoService;
    @Resource private CustomerCustomFieldService customFieldService;

    @Transactional(propagation = Propagation.REQUIRES_NEW, rollbackFor = Exception.class)
    public CustomerImportRowRespVO importRow(CustomerImportRowReqVO reqVO, Long ownerUserId) {
        CustomerDO existing = customerMapper.selectByImportKey(ownerUserId, reqVO.getIdempotencyKey());
        if (existing != null) return result(reqVO, "duplicate", "此行已导入", existing.getId());

        String stageCode = reqVO.getStage() == null || reqVO.getStage().isBlank()
                ? "new" : reqVO.getStage().trim();
        CustomerStageDO configuredStage = customerStageMapper.selectByCode(stageCode);
        if ((configuredStage != null && !Boolean.TRUE.equals(configuredStage.getEnabled()))
                || (configuredStage == null && !Set.of("new", "following", "converted", "paused").contains(stageCode))) {
            throw exception(ErrorCodeConstants.CUSTOMER_STAGE_INVALID);
        }

        String phone = reqVO.getPhone().replaceAll("[ -]", "");
        CustomerDO customer = new CustomerDO();
        customer.setId(IdUtil.getSnowflake().nextId());
        customer.setOwnerUserId(ownerUserId);
        customer.setNameCiphertext(piiCryptoService.encrypt(reqVO.getName().trim()));
        customer.setPhoneCiphertext(piiCryptoService.encrypt(phone));
        customer.setPhoneDisplay(maskPhone(phone));
        customer.setStage(stageCode);
        customer.setSource(blankToNull(reqVO.getSource()));
        customer.setTags(blankToNull(reqVO.getTags()));
        customer.setCustomFieldsCiphertext(customFieldService.validateAndEncrypt(
                null, reqVO.getCustomFields() == null ? Map.of() : reqVO.getCustomFields(), ownerUserId));
        customer.setImportKey(reqVO.getIdempotencyKey());
        customer.setStatus("active");
        customerMapper.insert(customer);

        CustomerStageEventDO event = new CustomerStageEventDO();
        event.setId(IdUtil.getSnowflake().nextId());
        event.setCustomerId(customer.getId());
        event.setToStage(stageCode);
        event.setChangedBy(ownerUserId);
        event.setChangedAt(LocalDateTime.now(ZoneOffset.UTC));
        event.setSource("customer_import");
        stageEventMapper.insert(event);
        return result(reqVO, "imported", "导入成功", customer.getId());
    }

    @Transactional(readOnly = true)
    public Long findExistingId(Long ownerUserId, String importKey) {
        CustomerDO existing = customerMapper.selectByImportKey(ownerUserId, importKey);
        return existing == null ? null : existing.getId();
    }

    private CustomerImportRowRespVO result(CustomerImportRowReqVO reqVO, String status, String message, Long id) {
        CustomerImportRowRespVO result = new CustomerImportRowRespVO();
        result.setRowNo(reqVO.getRowNo());
        result.setStatus(status);
        result.setMessage(message);
        result.setCustomerId(id);
        return result;
    }

    private String maskPhone(String phone) {
        return phone.length() <= 7 ? "****" : phone.substring(0, 3) + " **** " + phone.substring(phone.length() - 4);
    }

    private String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }
}
