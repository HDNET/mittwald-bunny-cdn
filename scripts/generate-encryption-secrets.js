import { randomBytes } from 'node:crypto'

console.log(`ENCRYPTION_MASTER_PASSWORD=${randomBytes(32).toString('hex')}`)
console.log(`ENCRYPTION_SALT=${randomBytes(16).toString('hex')}`)
