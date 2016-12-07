
const test = require('tape')
const { constants } = require('@tradle/engine')
const models = require('@tradle/models')
const { TYPE, SIG } = constants
const { Promise, co } = require('../../lib/utils')
const Session = require('../../lib/session')
const createBot = require('../bot')
const { fake } = require('./faker')

test('basic', co(function* (t) {
  //const bobIdentity = ...
  const bot = createBot({
    products: [
      'tradle.CurrentAccount'
    ],
    models: models
  })

  // bot.use(function (session) {
  // })

  const userData = {}
  const sharedData = {}
  const messages = [
    // as coming in via the log
    {
      type: 'tradle.SelfIntroduction',
      // this is not name, but the uuid of the user
      author: 'bob',
      envelope: {},
      payload: {
        [TYPE]: 'tradle.SelfIntroduction',
        identity: {},
        profile: {
          firstName: 'bob'
        }
      }
    },
    {
      type: 'tradle.ProductApplication',
      author: 'bob',
      envelope: {},
      payload: {
        [TYPE]: 'tradle.ProductApplication',
        [SIG]: '...',
        product: 'tradle.CurrentAccount'
      }
    },
    {
      type: 'tradle.PersonalInfo',
      author: 'bob',
      envelope: {
        context: '58dae6529d26c1e2c1f498df591cf5004b9dc1e5d9284f714775c6483661dd37'
      },
      payload: fake(models['tradle.PersonalInfo'])
    }
  ]

  const [
    intro,
    apply,
    personalInfo
  ] = messages.map(message => {
    return new Session.from({ message, userData, sharedData })
  })

  yield bot.run(intro)
  t.equal(intro.outbound.length, 1)
  t.equal(intro.outbound[0].object[TYPE], 'tradle.ProductList')
  t.same(userData, {
    user: 'bob',
    applications: [],
    products: {},
    prefilled: {},
    contexts: {},
    profile: { firstName: 'bob' }
  })

  yield bot.run(apply)
  t.equal(apply.outbound.length, 1)
  const [formReq] = apply.outbound
  t.equal(formReq.object[TYPE], 'tradle.FormRequest')
  t.equal(formReq.other.context, '58dae6529d26c1e2c1f498df591cf5004b9dc1e5d9284f714775c6483661dd37')

  yield bot.run(personalInfo)
  t.equal(personalInfo.outbound.length, 1)
  t.equal(personalInfo.outbound[0].object[TYPE], 'tradle.FormRequest')
}))
