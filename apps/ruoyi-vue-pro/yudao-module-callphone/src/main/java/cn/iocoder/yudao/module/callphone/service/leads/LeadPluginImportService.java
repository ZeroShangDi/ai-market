package cn.iocoder.yudao.module.callphone.service.leads;

import cn.iocoder.yudao.framework.datapermission.core.annotation.DataPermission;
import cn.iocoder.yudao.framework.mybatis.core.query.LambdaQueryWrapperX;
import cn.iocoder.yudao.module.callphone.controller.admin.leads.vo.LeadSaveReqVO;
import cn.iocoder.yudao.module.callphone.dal.dataobject.leads.LeadDO;
import cn.iocoder.yudao.module.callphone.dal.mysql.leads.LeadMapper;
import cn.iocoder.yudao.module.callphone.service.leads.LeadCreationService;
import cn.iocoder.yudao.module.callphone.service.security.PiiCryptoService;
import jakarta.annotation.Resource;
import jakarta.validation.Validator;
import org.springframework.stereotype.Service;
import java.util.*;

@Service
public class LeadPluginImportService {
    public record Row(int rowNo, LeadSaveReqVO lead) {}
    public record Input(String fingerprint, List<Row> rows) {}
    public record Result(int rowNo, String status, String leadId, String message) {}
    @Resource private LeadCreationService creation;
    @Resource private LeadMapper leads;
    @Resource private PiiCryptoService crypto;
    @Resource private Validator validator;

    // Exact actor-prefixed receipt lookup must survive automatic assignment outside the actor's owner scope.
    // Tenant filtering stays enabled; no customer listing or PII is returned by this operation.
    @DataPermission(enable = false)
    public List<Result> execute(Input input, Long actor) {
        if (input == null || input.fingerprint() == null || !input.fingerprint().matches("[a-f0-9]{64}")
                || input.rows() == null || input.rows().isEmpty() || input.rows().size() > 50) throw new IllegalArgumentException();
        Set<Integer> numbers = new HashSet<>();
        for (Row row : input.rows()) if (row == null || row.rowNo() < 2 || row.rowNo() > 501 || !numbers.add(row.rowNo())) throw new IllegalArgumentException();
        List<Result> result = new ArrayList<>();
        for (Row row : input.rows()) {
            if (row.lead() == null || !validator.validate(row.lead()).isEmpty()) {
                result.add(new Result(row.rowNo(), "failed", null, "姓名、号码、来源或评分格式不正确")); continue;
            }
            // 79 chars maximum; scoped to original user, file+mapping fingerprint, and source row.
            String key = "wi:" + actor + ":" + input.fingerprint().substring(0, 48) + ":" + row.rowNo();
            try {
                LeadDO prior = existing(key);
                if (prior != null) { result.add(replayed(row, prior)); continue; }
                Long id = creation.create(key, row.lead(), actor);
                LeadDO saved = existing(key);
                if (saved == null || !id.equals(saved.getId())) result.add(new Result(row.rowNo(), "unknown", null, "保存结果待核对，请用原文件重试"));
                else result.add(new Result(row.rowNo(), "imported", id.toString(), "已创建线索，沿用现有自动分配设置"));
            } catch (RuntimeException error) {
                // No raw database errors or row contents in diagnostic logs/results.
                try { LeadDO saved = existing(key); result.add(saved == null
                        ? new Result(row.rowNo(), "failed", null, "未保存，可用原文件重试") : replayed(row, saved)); }
                catch (RuntimeException unavailable) { result.add(new Result(row.rowNo(), "unknown", null, "结果待核对，请用原文件重试")); }
            }
        }
        return result;
    }
    private LeadDO existing(String key) { return leads.selectOne(new LambdaQueryWrapperX<LeadDO>().eq(LeadDO::getIdempotencyKey, key)); }
    private Result replayed(Row row, LeadDO prior) {
        LeadSaveReqVO value = row.lead();
        boolean same = Objects.equals(crypto.decrypt(prior.getNameCiphertext()), value.getName().trim())
                && Objects.equals(crypto.decrypt(prior.getPhoneCiphertext()), value.getPhone().replaceAll("[ -]", ""))
                && Objects.equals(prior.getSourceCode(), value.getSourceCode())
                && Objects.equals(prior.getScore(), value.getScore() == null ? 0 : value.getScore());
        return new Result(row.rowNo(), same ? "duplicate" : "failed", same ? prior.getId().toString() : null,
                same ? "此文件行已导入，未重复创建" : "导入标识对应内容已变化，请核对原记录");
    }
}
