import { createStart } from '@tanstack/react-start'
import { handleServerErrors } from './middleware/error-handling'

export const startInstance = createStart(() => {
  return {
    functionMiddleware: [handleServerErrors],
  }
})
