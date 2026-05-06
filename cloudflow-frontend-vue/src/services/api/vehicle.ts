import request from './request'
import type { PageResult } from '@/types'

export interface SysVehicle {
  vehicleId?: number
  licensePlate: string
  brand: string
  model?: string
  color?: string
  capacity?: number
  status?: string
  mileage?: number
  location?: string
}

export interface VehicleUsage {
  usageId?: number
  vehicleId: number
  applicantId: number
  startTime: string
  endTime: string
  destination: string
  reason: string
  passengerCount: number
  passengers?: string
  status?: string
}

export const getAvailableVehicles = () =>
  request.get<SysVehicle[]>('/oa/vehicle/available')

export const submitUsage = (data: VehicleUsage) =>
  request.post<void>('/oa/vehicle/usage', data)

export const getUsageList = (params?: Record<string, unknown>) =>
  request.get<PageResult<VehicleUsage>>('/oa/vehicle/usage/list', { params })
