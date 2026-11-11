import { rm } from 'node:fs/promises'

// The real-campus 3D model now lives outside public/ (see 保留资产-不打包/README.md),
// so it is no longer copied into dist. This stays as a safety net for stale builds.
const legacyCampusModel = new URL('../dist/assets/campus-3d-model.glb', import.meta.url)

await rm(legacyCampusModel, { force: true })
console.log('Ensured no real-campus 3D model in the Pages deployment.')
