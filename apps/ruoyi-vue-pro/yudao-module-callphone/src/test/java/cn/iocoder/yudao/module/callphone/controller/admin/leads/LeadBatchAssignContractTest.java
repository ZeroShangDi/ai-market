package cn.iocoder.yudao.module.callphone.controller.admin.leads;

import cn.iocoder.yudao.module.callphone.controller.admin.leads.LeadController.LeadBatchAssignReqVO;
import jakarta.validation.Validation;
import jakarta.validation.Validator;
import jakarta.validation.ValidatorFactory;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

import java.util.Arrays;
import java.util.List;
import java.util.Set;
import java.util.stream.LongStream;

import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assertions.assertFalse;

class LeadBatchAssignContractTest {

    private static ValidatorFactory factory;
    private static Validator validator;

    @BeforeAll
    static void createValidator() {
        factory = Validation.buildDefaultValidatorFactory();
        validator = factory.getValidator();
    }

    @AfterAll
    static void closeValidator() {
        factory.close();
    }

    @Test
    void acceptsUniqueBatchAtMaximumSize() {
        LeadBatchAssignReqVO req = request(LongStream.rangeClosed(1, 100).boxed().toList());

        assertTrue(validator.validate(req).isEmpty());
    }

    @Test
    void rejectsDuplicateIdsAndOversizedBatch() {
        LeadBatchAssignReqVO duplicate = request(List.of(9L, 9L));
        LeadBatchAssignReqVO oversized = request(LongStream.rangeClosed(1, 101).boxed().toList());

        assertFalse(validator.validate(duplicate).isEmpty());
        assertFalse(validator.validate(oversized).isEmpty());
    }

    @Test
    void rejectsEmptyBatchAndNullLeadId() {
        LeadBatchAssignReqVO empty = request(List.of());
        LeadBatchAssignReqVO nullId = request(Arrays.asList(1L, null));

        assertFalse(validator.validate(empty).isEmpty());
        assertFalse(validator.validate(nullId).isEmpty());
    }

    private static LeadBatchAssignReqVO request(List<Long> ids) {
        LeadBatchAssignReqVO req = new LeadBatchAssignReqVO();
        req.setLeadIds(ids);
        req.setToUserId(7L);
        req.setReason("批量分配");
        return req;
    }
}
