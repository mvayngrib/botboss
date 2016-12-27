
process.env.NODE_ENV = process.env.NODE_ENV || 'test'

const test = require('tape')
const tradle = require('@tradle/engine')
const { TYPE } = tradle.constants
const helpers = require('@tradle/engine/test/helpers')
const contexts = require('@tradle/engine/test/contexts')
const models = require('@tradle/models')
const { Promise, co } = require('../lib/utils')
const Runner = require('../')
const createBot = require('../example/bot')
const VERIFICATION = 'tradle.Verification'

test('basic', co(function* (t) {
  const nodes = contexts
    .nUsers(2)
    .map(node => tradle.utils.promisifyNode(node))

  const [customer, provider] = nodes
  yield customer.addContactIdentity(provider.identityInfo.object)
  // yield new Promise(resolve => setTimeout(resolve, 100))

  const r = new Runner({
    node: provider,
    db: helpers.nextDB(),
    log: provider.changes,
    bot: createBot({
      // autoverify: true,
      // autoprompt: true,
      products: [
        'tradle.CurrentAccount',
        'tradle.LifeInsurance'
      ],
      models: models
    })
  })

  connect([customer, r])
  const promiseVerifications = waitForType(customer, VERIFICATION, 2)

  yield customer.signAndSend({
    to: provider._recipientOpts,
    object: {
      [TYPE]: 'tradle.SelfIntroduction',
      identity: customer.identityInfo.object,
      profile: {
        firstName: 'alice'
      }
    }
  })

  yield receiveType(customer, 'tradle.ProductList')
  yield customer.signAndSend({
    to: provider._recipientOpts,
    object: {
      [TYPE]: 'tradle.ProductApplication',
      product: 'tradle.LifeInsurance'
    }
  })

  const pInfoReq = yield waitForType(customer, 'tradle.FormRequest')
  t.equal(pInfoReq.object.object.form, 'tradle.PersonalInfo')

  const context = pInfoReq.object.context
  yield customer.signAndSend({
    to: provider._recipientOpts,
    object: {
      [TYPE]: 'tradle.PersonalInfo'
    },
    other: { context }
  })

  const orvReq = yield waitForType(customer, 'tradle.FormRequest')
  t.equal(orvReq.object.object.form, 'tradle.ORV')

  yield customer.signAndSend({
    to: provider._recipientOpts,
    object: {
      [TYPE]: 'tradle.ORV'
    },
    other: { context }
  })

  const verifications = yield promiseVerifications
  t.equal(verifications.length, 2)
  verifications.forEach(v => t.equal(v.object.context, context))

  const [pInfoVerification, orvVerification] = verifications
  t.equal(pInfoVerification.object.object.document.title, 'tradle.PersonalInfo')
  t.equal(orvVerification.object.object.document.title, 'tradle.ORV')

  t.end()
  cleanupNodes(nodes)
}))

function connect (nodes) {
  nodes.forEach(a => {
    const node = getNode(a)
    const myInfo = { permalink: node.identityInfo.link }
    node._send = co(function* (msg, recipient, cb) {
      const b = nodes.find(other => {
        return getNode(other).permalink === recipient.permalink
      })

      try {
        var result = yield b.receive(msg, myInfo)
      } catch (err) {
        return cb(err)
      }

      cb()
    })
  })
}

function getNode (runnerOrNode) {
  return runnerOrNode instanceof Runner ? runnerOrNode.node : runnerOrNode
}

function cleanupNodes (nodes) {
  return nodes.map(n => n.destroy())
}

function receive (node, handler) {
  return new Promise(resolve => {
    node.once('message', co(function* (message, sender) {
      if (handler) {
        yield Promise.resolve(handler(message, sender))
      }

      resolve(message)
    }))
  })
}

function receiveVerifications (node, num) {
  return Promise.all(new Array(3).fill(0).map(n => {
    return receiveType(node, VERIFICATION)
  }))
}

function receiveType (node, type) {
  return receive(node, function (message) {
    assert(message.objectinfo.type === type, `expected ${type}, got ${message.objectinfo.type}"`)
  })
}

function waitFor (node, handler, count=1) {
  const numResults = count
  const onmessage = co(function* (message, sender) {
    if (handler) {
      yield Promise.resolve(handler(message, sender))
    }

    resolve(message)
  })

  const results = []
  return new Promise(resolve => {
    node.on('message', co(function* (message, sender) {
      const passed = yield Promise.resolve(handler(message, sender))
      if (passed) {
        results.push(message)
        if (--count === 0) {
          node.removeListener('message', onmessage)
          resolve(numResults === 1 ? results[0] : results)
        }
      }
    }))
  })
}

function waitForType (node, type, count) {
  return waitFor(node, function (message) {
    return message.objectinfo.type === type
  }, count)
}

function assert (statement, err) {
  if (!statement) throw new Error(err || 'assertion failed')
}
