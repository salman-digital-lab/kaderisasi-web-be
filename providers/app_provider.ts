import type { ApplicationService } from '@adonisjs/core/types'
import { BaseModel, SnakeCaseNamingStrategy } from '@adonisjs/lucid/orm'

export default class AppProvider {
  constructor(protected app: ApplicationService) {}

  /**
   * Register bindings to the container
   */
  register() {}

  /**
   * The container bindings have booted
   */
  async boot() {
    BaseModel.namingStrategy = new SnakeCaseNamingStrategy()
  }

  /**
   * The application has been booted
   */
  async start() {}

  /**
   * The process has been started
   */
  async ready() {}

  /**
   * Preparing to shutdown the app
   */
  async shutdown() {}
}
