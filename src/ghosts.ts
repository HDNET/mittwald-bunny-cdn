import { makeGhost } from '@mittwald/react-ghostmaker'
import {
  addCustomHostnameFn,
  checkPermissionsFn,
  createPullZoneFn,
  deleteApiKeyFn,
  deletePullZoneFn,
  getApiKeyStatusFn,
  getDomainsFn,
  getPullZoneStatusFn,
  getStatsFn,
  purgeCacheFn,
  removeCustomHostnameFn,
  saveApiKeyFn,
  updateSettingsFn,
} from '~/serverFunctions/index'

const bunnycdnClient = {
  getApiKeyStatus: getApiKeyStatusFn,
  saveApiKey: saveApiKeyFn,
  deleteApiKey: deleteApiKeyFn,
  getDomains: getDomainsFn,
  createPullZone: createPullZoneFn,
  deletePullZone: deletePullZoneFn,
  getPullZoneStatus: getPullZoneStatusFn,
  getStats: getStatsFn,
  purgeCache: purgeCacheFn,
  updateSettings: updateSettingsFn,
  checkPermissions: checkPermissionsFn,
  addCustomHostname: addCustomHostnameFn,
  removeCustomHostname: removeCustomHostnameFn,
}

export const BunnyCdnGhost = makeGhost(bunnycdnClient)
