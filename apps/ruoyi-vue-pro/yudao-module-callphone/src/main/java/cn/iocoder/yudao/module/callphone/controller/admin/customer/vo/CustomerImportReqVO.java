package cn.iocoder.yudao.module.callphone.controller.admin.customer.vo;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.util.List;

@Data
public class CustomerImportReqVO {
    @NotEmpty
    @Size(max = 500)
    private List<@Valid CustomerImportRowReqVO> rows;
}
