export enum VehicleEntryCategory {
  REPAIR        = 'REPAIR',
  SERVICE_VISIT = 'SERVICE_VISIT',
  TRIP          = 'TRIP',
  FUEL          = 'FUEL',
  UPGRADE       = 'UPGRADE',
  INSPECTION    = 'INSPECTION',
  BREAKDOWN     = 'BREAKDOWN',
  OTHER         = 'OTHER',
}

export const VEHICLE_CATEGORY_LABELS: Record<VehicleEntryCategory, string> = {
  [VehicleEntryCategory.REPAIR]:        'Repair',
  [VehicleEntryCategory.SERVICE_VISIT]: 'Service visit',
  [VehicleEntryCategory.TRIP]:          'Trip',
  [VehicleEntryCategory.FUEL]:          'Fuel',
  [VehicleEntryCategory.UPGRADE]:       'Upgrade',
  [VehicleEntryCategory.INSPECTION]:    'Inspection',
  [VehicleEntryCategory.BREAKDOWN]:     'Breakdown',
  [VehicleEntryCategory.OTHER]:         'Other',
};
