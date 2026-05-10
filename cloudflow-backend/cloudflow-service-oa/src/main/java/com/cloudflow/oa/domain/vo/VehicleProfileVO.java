package com.cloudflow.oa.domain.vo;

import com.cloudflow.oa.domain.OaRiskAlert;
import com.cloudflow.oa.domain.SysVehicle;
import com.cloudflow.oa.domain.VehicleExpense;
import com.cloudflow.oa.domain.VehicleMaintenance;
import com.cloudflow.oa.domain.VehicleUsage;
import com.cloudflow.oa.domain.VehicleViolation;
import lombok.Data;

import java.math.BigDecimal;
import java.util.List;

@Data
public class VehicleProfileVO {

    private SysVehicle vehicle;

    private VehicleUsage currentUsage;

    private VehicleUsage nextUsage;

    private List<VehicleUsage> recentUsages;

    private List<VehicleExpense> recentExpenses;

    private List<VehicleMaintenance> maintenances;

    private List<VehicleViolation> violations;

    private List<OaRiskAlert> risks;

    private BigDecimal expenseAmount30d;

    private BigDecimal expenseAmount90d;

    private BigDecimal tripDistance30d;

    private BigDecimal costPerKm30d;
}
