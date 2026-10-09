package cn.iocoder.yudao.module.callphone.service.customer;

import cn.iocoder.yudao.module.callphone.controller.admin.customer.vo.CustomerImportReqVO;
import cn.iocoder.yudao.module.callphone.controller.admin.customer.vo.CustomerImportRespVO;
import cn.iocoder.yudao.module.callphone.controller.admin.customer.vo.CustomerImportRowReqVO;
import cn.iocoder.yudao.module.callphone.controller.admin.customer.vo.CustomerImportRowRespVO;
import jakarta.annotation.Resource;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;

@Service
public class CustomerImportService {
    @Resource private CustomerImportRowService rowService;

    public CustomerImportRespVO importRows(CustomerImportReqVO reqVO, Long ownerUserId) {
        List<CustomerImportRowRespVO> rows = new ArrayList<>(reqVO.getRows().size());
        int imported = 0;
        int duplicate = 0;
        int failed = 0;
        for (CustomerImportRowReqVO row : reqVO.getRows()) {
            CustomerImportRowRespVO result;
            try {
                result = rowService.importRow(row, ownerUserId);
            } catch (DuplicateKeyException e) {
                Long existingId = rowService.findExistingId(ownerUserId, row.getIdempotencyKey());
                if (existingId != null) {
                    result = result(row, "duplicate", "此行已导入", existingId);
                } else {
                    result = result(row, "failed", "号码或导入标识重复，请检查数据后重试", null);
                }
            } catch (RuntimeException e) {
                result = result(row, "failed", "保存失败，可使用相同文件安全重试", null);
            }
            rows.add(result);
            if ("imported".equals(result.getStatus())) imported++;
            else if ("duplicate".equals(result.getStatus())) duplicate++;
            else failed++;
        }
        CustomerImportRespVO response = new CustomerImportRespVO();
        response.setRows(rows);
        response.setImportedCount(imported);
        response.setDuplicateCount(duplicate);
        response.setFailedCount(failed);
        return response;
    }

    private CustomerImportRowRespVO result(CustomerImportRowReqVO row, String status, String message, Long customerId) {
        CustomerImportRowRespVO result = new CustomerImportRowRespVO();
        result.setRowNo(row.getRowNo());
        result.setStatus(status);
        result.setMessage(message);
        result.setCustomerId(customerId);
        return result;
    }
}
