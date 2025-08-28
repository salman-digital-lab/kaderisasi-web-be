import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'clubs'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      // Update the default value to include after_registration_info
      table.jsonb('registration_info').defaultTo('{"registration_info": "", "after_registration_info": ""}').alter()
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      // Revert to the original default value
      table.jsonb('registration_info').defaultTo('{"registration_info": ""}').alter()
    })
  }
}
