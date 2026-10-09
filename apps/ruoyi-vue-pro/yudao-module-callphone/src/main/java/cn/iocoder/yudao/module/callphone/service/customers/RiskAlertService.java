package cn.iocoder.yudao.module.callphone.service.customers;

import cn.hutool.core.util.IdUtil;
import cn.iocoder.yudao.framework.common.pojo.PageResult;
import cn.iocoder.yudao.framework.mybatis.core.query.LambdaQueryWrapperX;
import cn.iocoder.yudao.module.callphone.controller.admin.customers.vo.RiskAlertPageReqVO;
import cn.iocoder.yudao.module.callphone.controller.admin.customers.vo.RiskAlertPageRespVO;
import cn.iocoder.yudao.module.callphone.controller.admin.customers.vo.RiskAlertResolveReqVO;
import cn.iocoder.yudao.module.callphone.controller.admin.customers.vo.RiskAlertRespVO;
import cn.iocoder.yudao.module.callphone.controller.admin.customers.vo.RiskRuleRespVO;
import cn.iocoder.yudao.module.callphone.controller.admin.customers.vo.RiskRuleSaveReqVO;
import cn.iocoder.yudao.module.callphone.dal.dataobject.customers.RiskAlertDO;
import cn.iocoder.yudao.module.callphone.dal.dataobject.customers.RiskRuleDO;
import cn.iocoder.yudao.module.callphone.dal.dataobject.outbound.CustomerDO;
import cn.iocoder.yudao.module.callphone.dal.dataobject.outbound.FollowUpTaskDO;
import cn.iocoder.yudao.module.callphone.dal.mysql.customers.RiskAlertMapper;
import cn.iocoder.yudao.module.callphone.dal.mysql.customers.RiskRuleMapper;
import cn.iocoder.yudao.module.callphone.dal.mysql.outbound.CustomerMapper;
import cn.iocoder.yudao.module.callphone.dal.mysql.outbound.FollowUpTaskMapper;
import cn.iocoder.yudao.module.callphone.enums.ErrorCodeConstants;
import cn.iocoder.yudao.module.callphone.service.security.PiiCryptoService;
import cn.iocoder.yudao.module.system.api.user.AdminUserApi;
import cn.iocoder.yudao.module.system.api.user.dto.AdminUserRespDTO;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import jakarta.annotation.Resource;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Objects;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import static cn.iocoder.yudao.framework.common.exception.util.ServiceExceptionUtil.exception;

@Service
public class RiskAlertService {

    @Resource private RiskAlertMapper alertMapper;
    @Resource private RiskRuleMapper ruleMapper;
    @Resource private CustomerMapper customerMapper;
    @Resource private FollowUpTaskMapper taskMapper;
    @Resource private PiiCryptoService cryptoService;
    @Resource private AdminUserApi adminUserApi;

    public RiskAlertPageRespVO getPage(RiskAlertPageReqVO reqVO, Long userId) {
        PageResult<RiskAlertDO> result = alertMapper.selectPage(reqVO, userId);
        RiskAlertPageRespVO resp = new RiskAlertPageRespVO();
        resp.setList(result.getList().stream().map(row -> toResp(row, userId)).toList());
        resp.setTotal(result.getTotal());
        resp.setOpenCount(alertMapper.countByStatus(userId, "open"));
        resp.setHighCount(alertMapper.countBySeverity(userId, "high"));
        resp.setMediumCount(alertMapper.countBySeverity(userId, "medium"));
        resp.setLowCount(alertMapper.countBySeverity(userId, "low"));
        resp.setResolvedCount(alertMapper.countByStatus(userId, "resolved"));
        return resp;
    }

    public RiskAlertRespVO get(Long id, Long userId) {
        return toResp(requireOwnedAlert(id, userId), userId);
    }

    @Transactional(rollbackFor = Exception.class)
    public boolean resolve(RiskAlertResolveReqVO reqVO, Long userId) {
        RiskAlertDO row = requireOwnedAlert(reqVO.getId(), userId);
        if (!"open".equals(row.getStatus()) || !Objects.equals(row.getVersion(), reqVO.getExpectedVersion())) {
            throw exception(ErrorCodeConstants.RISK_ALERT_STATE_CONFLICT);
        }
        int updated = alertMapper.update(null, new LambdaUpdateWrapper<RiskAlertDO>()
                .eq(RiskAlertDO::getId, row.getId()).eq(RiskAlertDO::getOwnerUserId, userId)
                .eq(RiskAlertDO::getStatus, "open").eq(RiskAlertDO::getVersion, reqVO.getExpectedVersion())
                .set(RiskAlertDO::getStatus, "resolved")
                .set(RiskAlertDO::getResolutionReasonCiphertext, cryptoService.encrypt(reqVO.getReason().trim()))
                .set(RiskAlertDO::getResolverId, userId).set(RiskAlertDO::getResolvedAt, LocalDateTime.now())
                .set(RiskAlertDO::getVersion, reqVO.getExpectedVersion() + 1));
        if (updated == 0) throw exception(ErrorCodeConstants.RISK_ALERT_STATE_CONFLICT);
        return true;
    }

    @Transactional(rollbackFor = Exception.class)
    public List<RiskRuleRespVO> getRules(Long userId) {
        List<RiskRuleDO> rows = ensureRules();
        return rows.stream().map(this::toRuleResp).toList();
    }

    @Transactional(rollbackFor = Exception.class)
    public RiskRuleRespVO saveRule(RiskRuleSaveReqVO reqVO, Long userId) {
        RiskRuleDO row = ruleMapper.selectById(reqVO.getId());
        if (row == null || !Objects.equals(row.getRuleCode(), reqVO.getRuleCode())
                || !Objects.equals(row.getVersion(), reqVO.getVersion())) {
            throw exception(ErrorCodeConstants.RISK_RULE_INVALID);
        }
        int updated = ruleMapper.update(null, new LambdaUpdateWrapper<RiskRuleDO>()
                .eq(RiskRuleDO::getId, row.getId()).eq(RiskRuleDO::getVersion, reqVO.getVersion())
                .set(RiskRuleDO::getEnabled, reqVO.getEnabled())
                .set(RiskRuleDO::getThresholdDays, reqVO.getThresholdDays())
                .set(RiskRuleDO::getSeverity, reqVO.getSeverity())
                .set(RiskRuleDO::getVersion, reqVO.getVersion() + 1));
        if (updated == 0) throw exception(ErrorCodeConstants.RISK_RULE_INVALID);
        return toRuleResp(ruleMapper.selectById(row.getId()));
    }

    @Transactional(rollbackFor = Exception.class)
    public int scan(Long userId) {
        int created = 0;
        LocalDateTime now = LocalDateTime.now();
        for (RiskRuleDO rule : ensureRules()) {
            if (!Boolean.TRUE.equals(rule.getEnabled())) continue;
            if ("overdue_follow_up".equals(rule.getRuleCode())) {
                LocalDateTime cutoff = now.minusDays(rule.getThresholdDays());
                for (FollowUpTaskDO task : taskMapper.selectOverdueForRiskScan(userId, cutoff)) {
                    if (addIfNew(rule, userId, task.getCustomerId(), "follow_up_task", task.getId(),
                            "跟进事项已超过截止时间 " + Math.max(1, java.time.Duration.between(task.getDueAt(), now).toDays()) + " 天。")) created++;
                }
            } else if ("stale_customer".equals(rule.getRuleCode())) {
                LocalDateTime cutoff = now.minusDays(rule.getThresholdDays());
                for (CustomerDO customer : customerMapper.selectStaleForRiskScan(userId, cutoff)) {
                    long ageDays = java.time.Duration.between(customer.getUpdateTime(), now).toDays();
                    String detail = "客户资料超过 " + Math.max(1, ageDays) + " 天未更新，可结合沟通记录判断是否需要回访。";
                    if (addIfNew(rule, userId, customer.getId(), "customer", customer.getId(), detail)) created++;
                }
            }
        }
        return created;
    }

    private boolean addIfNew(RiskRuleDO rule, Long userId, Long customerId, String sourceType, Long sourceId, String detail) {
        if (customerId == null || alertMapper.selectOpen(userId, rule.getRuleCode(), sourceType, sourceId) != null) return false;
        CustomerDO customer = customerMapper.selectById(customerId);
        if (customer == null || !Objects.equals(customer.getOwnerUserId(), userId) || !"active".equals(customer.getStatus())) return false;
        RiskAlertDO row = new RiskAlertDO();
        row.setId(IdUtil.getSnowflake().nextId()); row.setRuleCode(rule.getRuleCode()); row.setOwnerUserId(userId);
        row.setCustomerId(customerId); row.setSourceType(sourceType); row.setSourceId(sourceId);
        row.setSeverity(rule.getSeverity()); row.setStatus("open"); row.setDetailCiphertext(cryptoService.encrypt(detail)); row.setVersion(1);
        try {
            alertMapper.insert(row);
            return true;
        } catch (DuplicateKeyException duplicate) {
            return false;
        }
    }

    private List<RiskRuleDO> ensureRules() {
        List<RiskRuleDO> rows = ruleMapper.selectAll();
        if (!rows.isEmpty()) return rows;
        addDefaultRule("overdue_follow_up", "跟进事项逾期", "未完成且超过配置天数的跟进事项。", 1, "high");
        addDefaultRule("stale_customer", "客户长期未更新", "客户资料超过配置天数未新增或修改，可结合沟通记录判断是否回访。", 14, "medium");
        return ruleMapper.selectAll();
    }

    private void addDefaultRule(String code, String name, String description, int thresholdDays, String severity) {
        RiskRuleDO row = new RiskRuleDO(); row.setId(IdUtil.getSnowflake().nextId()); row.setRuleCode(code);
        row.setName(name); row.setDescription(description); row.setEnabled(true); row.setThresholdDays(thresholdDays);
        row.setSeverity(severity); row.setVersion(1);
        try { ruleMapper.insert(row); } catch (DuplicateKeyException ignored) { /* Another request initialized this tenant. */ }
    }

    private RiskAlertDO requireOwnedAlert(Long id, Long userId) {
        RiskAlertDO row = alertMapper.selectById(id);
        if (row == null || !Objects.equals(row.getOwnerUserId(), userId)) throw exception(ErrorCodeConstants.RISK_ALERT_NOT_FOUND);
        return row;
    }

    private RiskAlertRespVO toResp(RiskAlertDO row, Long userId) {
        CustomerDO customer = customerMapper.selectById(row.getCustomerId());
        if (customer == null || !Objects.equals(customer.getOwnerUserId(), userId)) throw exception(ErrorCodeConstants.RISK_ALERT_NOT_FOUND);
        RiskAlertRespVO resp = new RiskAlertRespVO();
        RiskRuleDO rule = ruleMapper.selectByCode(row.getRuleCode());
        resp.setId(row.getId()); resp.setRuleCode(row.getRuleCode()); resp.setRuleName(rule == null ? row.getRuleCode() : rule.getName());
        resp.setSeverity(row.getSeverity()); resp.setStatus(row.getStatus()); resp.setSourceType(row.getSourceType()); resp.setSourceId(row.getSourceId());
        resp.setCustomerId(row.getCustomerId()); resp.setCustomerName(cryptoService.decrypt(customer.getNameCiphertext())); resp.setPhoneDisplay(customer.getPhoneDisplay());
        resp.setDetail(cryptoService.decrypt(row.getDetailCiphertext())); resp.setCreatedAt(row.getCreateTime()); resp.setResolvedAt(row.getResolvedAt());
        resp.setResolutionReason(cryptoService.decrypt(row.getResolutionReasonCiphertext())); resp.setVersion(row.getVersion());
        if ("follow_up_task".equals(row.getSourceType())) {
            FollowUpTaskDO task = taskMapper.selectById(row.getSourceId());
            resp.setSourceTitle(task == null ? "跟进事项" : cryptoService.decrypt(task.getTitleCiphertext()));
        } else resp.setSourceTitle("客户资料");
        if (row.getResolverId() != null) {
            AdminUserRespDTO resolver = adminUserApi.getUser(row.getResolverId());
            resp.setResolverName(resolver == null ? null : resolver.getNickname());
        }
        return resp;
    }

    private RiskRuleRespVO toRuleResp(RiskRuleDO row) {
        RiskRuleRespVO resp = new RiskRuleRespVO(); resp.setId(row.getId()); resp.setRuleCode(row.getRuleCode());
        resp.setName(row.getName()); resp.setDescription(row.getDescription()); resp.setEnabled(row.getEnabled());
        resp.setThresholdDays(row.getThresholdDays()); resp.setSeverity(row.getSeverity()); resp.setVersion(row.getVersion());
        return resp;
    }
}
