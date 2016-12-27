
const test = require('tape')
const { constants } = require('@tradle/engine')
const models = require('@tradle/models')
const { TYPE, SIG } = constants
const { Promise, co } = require('../../lib/utils')
const Session = require('../../lib/session')
const createBot = require('../bot')
const { fake, fakeSigned, fakeSent, fakeFromDB } = require('./helpers/faker')

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
  // console.log(fakeFromDB({ model: models['tradle.SelfIntroduction'], author: 'bob'}))
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
        },
        [SIG]: '...'
      },
      metadata: fakeMetadata('bob')
    },
    {
      type: 'tradle.ProductApplication',
      author: 'bob',
      envelope: {},
      payload: {
        [TYPE]: 'tradle.ProductApplication',
        [SIG]: '...',
        product: 'tradle.CurrentAccount'
      },
      metadata: fakeMetadata('bob')
    },
    {
      type: 'tradle.PersonalInfo',
      author: 'bob',
      envelope: {
        context: '58dae6529d26c1e2c1f498df591cf5004b9dc1e5d9284f714775c6483661dd37'
      },
      payload: fakeSigned(models['tradle.PersonalInfo']),
      metadata: fakeMetadata('bob')
    }
  ]

  const received = []
  const node = {
    send: function (opts) {
      received.push(opts)
      return fakeSent(opts)
    },
    signAndSend: function (opts) {
      received.push(opts)
      return fakeSent(opts)
    },
    seal: link => {
      console.log('SEALING', link)
      return Promise.resolve()
    }
  }

  const [
    intro,
    apply,
    personalInfo
  ] = messages.map(message => {
    return new Session.from({ node, message, userData, sharedData })
  })

  yield bot.run(intro)
  t.equal(received.length, 1)
  t.equal(received[0].object[TYPE], 'tradle.ProductList')
  t.same(userData, {
    user: 'bob',
    applications: [],
    products: {},
    prefilled: {},
    contexts: {},
    profile: { firstName: 'bob' }
  })

  received.length = 0
  yield bot.run(apply)
  t.equal(received.length, 1)
  const [formReq] = received
  t.equal(formReq.object[TYPE], 'tradle.FormRequest')
  t.equal(formReq.other.context, '58dae6529d26c1e2c1f498df591cf5004b9dc1e5d9284f714775c6483661dd37')

  received.length = 0
  yield bot.run(personalInfo)
  t.equal(received.length, 2)
  const [verification, confirmation] = received
  t.equal(verification.object[TYPE], 'tradle.Verification')
  t.equal(verification.other.context, '58dae6529d26c1e2c1f498df591cf5004b9dc1e5d9284f714775c6483661dd37')
  t.equal(confirmation.object[TYPE], 'tradle.CurrentAccountConfirmation')

  t.end()
}))

function fakeMetadata (author) {
  return {
    envelope: {
      author: author,
      link: 'a',
      permalink: 'b'
    },
    payload: {
      link: 'b',
      permalink: 'b',
      author: author
    }
  }
}
