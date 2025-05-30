import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

const AuthController = () => import('#controllers/auth_controller')
const ProfilesController = () => import('#controllers/profiles_controller')
const ActivitiesController = () => import('#controllers/activities_controller')
const RuangCurhatsController = () => import('#controllers/ruang_curhats_controller')
const LeaderboardsController = () => import('#controllers/leaderboards_controller')

router
  .group(() => {
    router
      .group(() => {
        router.post('register', [AuthController, 'register'])
        router.post('login', [AuthController, 'login'])
        router.post('forgot-password', [AuthController, 'sendPasswordRecovery'])
        router.put('reset-password', [AuthController, 'resetPassword'])
        router.put('logout', [AuthController, 'logout']).use(middleware.auth())
      })
      .prefix('auth')

    router
      .group(() => {
        router.put('', [ProfilesController, 'update'])
        router.get('', [ProfilesController, 'show'])
        router.get('activities', [ProfilesController, 'activities'])
        router.get('activities/:slug', [ActivitiesController, 'registrationCheck'])
        router.post('picture', [ProfilesController, 'uploadPicture'])
      })
      .prefix('profiles')
      .use(middleware.auth())

    router
      .group(() => {
        router.post(':slug/register/', [ActivitiesController, 'register']).use(middleware.auth())
        router
          .put(':slug/registration', [ActivitiesController, 'questionnaireEdit'])
          .use(middleware.auth())
        router
          .get(':slug/registration', [ActivitiesController, 'getRegistrationData'])
          .use(middleware.auth())
        router.get('/:slug', [ActivitiesController, 'show'])
        router.get('', [ActivitiesController, 'index'])
      })
      .prefix('activities')

    router
      .group(() => {
        router.post('', [RuangCurhatsController, 'store'])
        router.get('', [RuangCurhatsController, 'history'])
      })
      .prefix('ruang-curhat')
      .use(middleware.auth())

    router
      .group(() => {
        router.post('', [LeaderboardsController, 'store']).use(middleware.auth())
        router.put('/:id', [LeaderboardsController, 'update']).use(middleware.auth())
        router.get('monthly', [LeaderboardsController, 'monthly'])
        router.get('lifetime', [LeaderboardsController, 'lifetime'])
        router.get('', [LeaderboardsController, 'myAchievements']).use(middleware.auth())
      })
      .prefix('achievements')
  })
  .prefix('v2')

router.get('health', () => ({ status: 'ok' }))
