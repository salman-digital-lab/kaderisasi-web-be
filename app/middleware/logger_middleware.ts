import { HttpContext } from '@adonisjs/core/http'
import { NextFn } from '@adonisjs/core/types/http'
import logger from '@adonisjs/core/services/logger'

export default class {
  async handle({ request, response }: HttpContext, next: NextFn) {
    await next()
    const datetime = new Date().toLocaleString()

    if (response.getStatus() < 400) {
      logger.info(
        'Datetime:' +
          datetime +
          ' | IP: ' +
          request.ip() +
          ' | Method: ' +
          request.method() +
          ' | URL: ' +
          request.url() +
          ' | Response Status: ' +
          JSON.stringify(response.getStatus())
      )
    } else {
      logger.error(
        'DATE: ' +
          datetime +
          ' | IP: ' +
          request.ip() +
          ' | METHOD: ' +
          request.method() +
          ' | URL: ' +
          request.url() +
          ' | STATUS: ' +
          JSON.stringify(response.getStatus()) +
          ' | BODY: ' +
          JSON.stringify(response.getBody())
      )
    }
  }
}
