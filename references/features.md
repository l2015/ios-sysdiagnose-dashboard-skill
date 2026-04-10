# Analyzable Features from PowerLog Database

The PowerLog `.PLSQL` database contains 600+ tables. Below are the categories and features that can be extracted.

## Battery (20+ tables)

| Feature | Table | Status |
|---------|-------|--------|
| Health %, cycles, capacity | PLBatteryAgent_EventBackward_Battery | ✅ |
| Level trend over time | PLBatteryAgent_EventBackward_Battery | ✅ |
| Temperature, voltage, current | PLBatteryAgent_EventBackward_Battery | ✅ |
| Charging sessions | PLBatteryAgent_EventInterval_Charging | 🔲 |
| Adapter power (watts) | PLBatteryAgent_EventBackward_Adapter | 🔲 |
| Time-to-80 prediction | BatteryIntelligence_TimeTo80_1_2 | 🔲 |
| Smart charging decisions | PLBatteryAgent_EventForward_SmartCharging | 🔲 |
| Battery saver mode | PLDuetService_EventForward_BatterySaverMode | 🔲 |
| Service flags, calibration | PLBatteryAgent_EventNone_BatteryConfig | ✅ |

## App Metrics (30+ tables)

| Feature | Table | Status |
|---------|-------|--------|
| NAND logical writes | PLCoalitionAgent_Aggregate_NANDStats | ✅ |
| Screen time (fg/bg) | PLAppTimeService_Aggregate_AppRunTime | ✅ |
| Energy consumption | PLDuetService_Aggregate_DuetEnergyAccumulator | ✅ |
| CPU time | PLCoalitionAgent_EventInterval_CoalitionInterval | ✅ |
| Peak memory | PLApplicationAgent_EventBackward_ApplicationMemory | ✅ |
| GPS usage | PLLocationAgent_EventForward_ClientStatus | ✅ |
| Network traffic | PLProcessNetworkAgent_EventInterval_UsageDiff | ✅ |
| Cellular data | PLAppTimeService_Aggregate_CellularCondition | 🔲 |
| App exits (reason) | PLApplicationAgent_EventPoint_ApplicationExitReason | ✅ |
| App launch time | PLProcessMonitorAgent_EventBackward_AppLaunchTimeSeries | 🔲 |
| Widget updates | PLApplicationAgent_Aggregate_WidgetUpdates | 🔲 |
| Notifications per app | PLSpringBoardAgent_Aggregate_SBNotifications_Aggregate | 🔲 |
| Background transfers | PLXPCAgent_EventPoint_BackgroundTransfer | 🔲 |
| CloudKit sync | PLXPCAgent_EventPoint_CloudKit | 🔲 |
| Spotlight queries | PLXPCAgent_EventInterval_SpotlightQueries | 🔲 |

## Display (10+ tables)

| Feature | Table | Status |
|---------|-------|--------|
| Brightness trend | PLDisplayAgent_EventForward_Display | ✅ |
| Screen on/off state | PLScreenStateAgent_EventForward_ScreenState | 🔲 |
| APL power stats | PLDisplayAgent_EventBackward_APLStats | 🔲 |
| Blue light filter | PLDisplayAgent_EventBackward_BlueLightParameters | 🔲 |
| Auto-brightness | PLDisplayAgent_EventForward_ALSUserPreferences | 🔲 |
| Ambient mode (AOD) | PLApplicationAgent_EventForward_AmbientMode | 🔲 |

## Network (15+ tables)

| Feature | Table | Status |
|---------|-------|--------|
| WiFi scan durations | PLWifiAgent_EventBackward_CumulativeProperties | 🔲 |
| Cumulative network bytes | PLNetworkAgent_EventBackward_CumulativeNetworkUsage | 🔲 |
| Bluetooth power | PLBluetoothAgent_EventBackward_PowerProfileStats | 🔲 |
| Push notifications | PLPushAgent_EventPoint_ReceivedPush | 🔲 |
| IDS message volume | PLIdentityServicesAgent_EventInterval_IDSMessagePeriodic | 🔲 |
| AirDrop | PLXPCAgent_EventForward_AirDrop | 🔲 |

## Location (10+ tables)

| Feature | Table | Status |
|---------|-------|--------|
| GPS power | PLLocationAgent_EventBackward_GPSPower | 🔲 |
| Tech distribution | PLLocationAgent_EventForward_TechStatus | 🔲 |

## System (15+ tables)

| Feature | Table | Status |
|---------|-------|--------|
| Memory pressure | PLPerformanceAgent_EventPoint_SystemMemory | 🔲 |
| CPU residency | PLIOReportAgent_EventBackward_CorePerformanceLevelResidency | 🔲 |
| SoC energy | PLIOReportAgent_EventBackward_EnergyModel | 🔲 |
| Kernel task CPU | PLProcessMonitorAgent_EventInterval_KernelTaskMonitor | 🔲 |
| Process exits | PLProcessMonitorAgent_EventPoint_ProcessExit | 🔲 |
| Swap usage | PLProcessMonitorAgent_EventPoint_SystemFreezerStats | 🔲 |
| Power modes | PowerModes_*_1_2 | 🔲 |

## Multimedia (5+ tables)

| Feature | Table | Status |
|---------|-------|--------|
| Now playing | PLAudioAgent_EventForward_NowPlaying | 🔲 |
| Video playback | PLVideoAgent_EventBackward_CMVideoPlayback | 🔲 |
| Camera usage | PLCameraAgent_EventForward_Camera | 🔲 |
| Haptics | PLAudioAgent_EventPoint_Haptics | 🔲 |
