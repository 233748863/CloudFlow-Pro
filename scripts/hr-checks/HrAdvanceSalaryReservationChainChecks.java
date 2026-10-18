package com.cloudflow.hr.service;

import com.cloudflow.hr.domain.entity.HrAdvanceRepayment;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.function.Consumer;

public final class HrAdvanceSalaryReservationChainChecks {
    private static int checks;
    public static void main(String[] arguments) {
        equal(null, current(List.of()), "no original reservation");
        for (String state : List.of("RESERVED","RELEASED","POSTED")) {
            List<HrAdvanceRepayment> rows = new ArrayList<>(List.of(positive(1L, "SALARY:20:ADVANCE:10", state)));
            equal(1L,current(rows).getRepaymentId(),"ordinary salary reservation unchanged");
        }
        for (int cycles = 1; cycles <= 20; cycles++) {
            List<HrAdvanceRepayment> rows = chain(cycles);
            equal((long)cycles*2+1,current(rows).getRepaymentId(),"each completed settlement refund has exactly one latest reservation");
            BigDecimal sum = rows.stream().filter(row -> !"RELEASED".equals(row.getStatus())).map(HrAdvanceRepayment::getRepayAmount).reduce(BigDecimal.ZERO,BigDecimal::add);
            equal(new BigDecimal("100.00"),sum,"historical originals and refunds leave only current reserved principal");
        }
        List<HrAdvanceRepayment> ordinaryCorrection = chain(1); ordinaryCorrection.remove(2);
        HrAdvanceRepayment correction = ordinaryCorrection.get(1); correction.setSettlementId(null); correction.setSalarySlipId(30L); correction.setSourceEventKey("SALARY_CORRECTION:30:REPAYMENT:1");
        equal(1L,current(ordinaryCorrection).getRepaymentId(),"ordinary payroll correction retains reversed original without restored reservation");
        reject(rows -> rows.remove(1),"restoration without actual refund rejected");
        reject(rows -> rows.remove(2),"settlement refund without replacement reservation rejected");
        reject(rows -> rows.get(0).setStatus("POSTED"),"replacement cannot bypass reversing original");
        reject(rows -> rows.get(1).setStatus("RESERVED"),"refund must be posted");
        reject(rows -> rows.get(1).setRepayAmount(new BigDecimal("-99.99")),"refund must match original cents");
        reject(rows -> rows.get(2).setRepayAmount(new BigDecimal("99.99")),"restored principal must match original deduction");
        reject(rows -> rows.get(1).setReversalOfId(999L),"refund cannot refer to another original");
        reject(rows -> rows.get(2).setSourceEventKey("SALARY:20:ADVANCE:10:AFTER:999"),"replacement must refer to actual predecessor");
        reject(rows -> rows.get(1).setSourceEventKey("SETTLEMENT_REVERSAL:999:REPAYMENT:1"),"refund event must refer to its settlement");
        reject(rows -> rows.get(1).setSalarySlipId(20L),"settlement refund cannot masquerade as new salary deduction");
        reject(rows -> rows.get(0).setTenantId(100001L),"other tenant rejected");
        reject(rows -> rows.get(1).setAdvanceId(11L),"other loan rejected");
        reject(rows -> rows.get(2).setSalarySlipId(21L),"other salary rejected");
        reject(rows -> rows.get(2).setRepayMonth("2026-10"),"month cannot move");
        reject(rows -> rows.get(2).setPostedTime(LocalDateTime.now()),"reservation cannot invent posted time");
        reject(rows -> rows.get(0).setPostedTime(null),"original must have posted time");
        reject(rows -> rows.get(1).setRepayDate(LocalDate.of(2026,8,31)),"refund cannot precede original repayment");
        reject(rows -> rows.add(positive(99L,"UNLINKED","RESERVED")),"unlinked second reservation rejected");
        reject(rows -> rows.add(positive(99L,"SALARY:20:ADVANCE:10:AFTER:1","RESERVED")),"two successors rejected");
        reject(rows -> { HrAdvanceRepayment extra=refund(99L,1L,701L); rows.add(extra); },"two refunds of one original rejected");
        reject(rows -> rows.get(1).setSettlementId(null),"settlement event cannot masquerade as ordinary correction");
        reject(rows -> rows.get(2).setRepayAmount(new BigDecimal("100.001")),"fractional cents rejected");
        System.out.println("H2_ADVANCE_SALARY_RESERVATION_CHAIN: checks="+checks+"; failed=0; maximum_test_cycles=20; actual_rules=true; database=false; source_posting=false; http=false");
    }
    private static List<HrAdvanceRepayment> chain(int cycles) {
        List<HrAdvanceRepayment> rows = new ArrayList<>(); rows.add(positive(1L,"SALARY:20:ADVANCE:10","REVERSED"));
        for(int index=0; index<cycles; index++) {
            long original=index*2L+1, refundId=original+1, next=original+2;
            rows.add(refund(refundId,original,700L+index));
            rows.add(positive(next,"SALARY:20:ADVANCE:10:AFTER:"+original,index==cycles-1?"RESERVED":"REVERSED"));
        }
        return rows;
    }
    private static HrAdvanceRepayment positive(Long id,String key,String status) {
        HrAdvanceRepayment row=new HrAdvanceRepayment(); row.setRepaymentId(id); row.setTenantId(100000L); row.setAdvanceId(10L); row.setSalarySlipId(20L);
        row.setSourceEventKey(key); row.setRepayMonth("2026-09"); row.setRepayType("SALARY"); row.setStatus(status); row.setRepayAmount(new BigDecimal("100.00"));
        if(List.of("POSTED","REVERSED").contains(status)) {row.setRepayDate(LocalDate.of(2026,9,1)); row.setPostedTime(LocalDateTime.of(2026,9,1,10,0));}
        return row;
    }
    private static HrAdvanceRepayment refund(Long id,Long original,Long settlement) {
        HrAdvanceRepayment row=positive(id,"SETTLEMENT_REVERSAL:"+settlement+":REPAYMENT:"+original,"POSTED"); row.setSalarySlipId(null);
        row.setSettlementId(settlement); row.setReversalOfId(original); row.setRepayAmount(new BigDecimal("-100.00")); return row;
    }
    private static HrAdvanceRepayment current(List<HrAdvanceRepayment> rows) {return HrAdvanceSalaryReservationChain.current(100000L,10L,20L,"2026-09",rows);}
    private static void reject(Consumer<List<HrAdvanceRepayment>> mutation,String label) {List<HrAdvanceRepayment> rows=chain(1);mutation.accept(rows);boolean rejected=false;try{current(rows);}catch(HrHException expected){rejected=true;}equal(true,rejected,label);}
    private static void equal(Object expected,Object actual,String label) {if(!Objects.equals(expected,actual))throw new AssertionError(label);checks++;}
}
