'use strict'

process.env.NODE_ENV = process.env.NODE_ENV || 'test'

const testco = require('tape-co').default
const test = require('tape')
const extend = require('xtend/mutable')
const memdown = require('memdown')
const changesFeed = require('changes-feed')
const tradle = require('@tradle/engine')
const { TYPE, MESSAGE_TYPE } = tradle.constants
const Runner = require('../')
const builder = require('../lib/builders')
const { Promise, co } = require('../lib/utils')

let dbCounter = 0
const createDB = function () {
  return tradle.utils.levelup('' + (dbCounter++), { db: memdown })
}

const createLog = function () {
  return changesFeed(createDB())
}

test('blah', function (t) {
  const objects = {
    a: {
      [TYPE]: MESSAGE_TYPE,
      object: {
        [TYPE]: 'hey',
        message: 'ho'
      }
    }
  }

  // TODO: take this out to test helpers
  const node = {
    permalink: 'joe',
    objects: {
      get: function (link) {
        if (link in objects) {
          return Promise.resolve(objects[link])
        }

        const err = new Error('NotFound')
        err.notFound = true
        return Promise.reject(err)
      }
    }
  }

  const expectedSharedData = {
    blah: 'blah'
  }

  const expectedUserData = {
    something: {
      some: 'data'
    }
  }

  const log = createLog()
  log.append({
    topic: 'newobj',
    author: 'bob',
    link: 'a',
    type: objects.a[TYPE]
  }, rethrow)

  const db = createDB()
  const b = new builder.Bot()
  b.use(function (session) {
    return new Promise(resolve => {
      session.userData.something = {
        some: 'data'
      }

      setTimeout(resolve, 100)
    })
  })

  b.type('hey', function (session) {
    extend(session.sharedData, expectedSharedData)
  })

  b.type('hi', t.fail)

  const r = new Runner({
    node,
    db: db,
    log: log,
    bot: b
  })

  r.on('handled', co(function* (session) {
    // make sure throwing away the db
    // doesn't result in re-handling of messages
    const s = new Runner({
      node: node,
      db: createDB(),
      log: log,
      bot: b
    })

    s.on('handled', t.fail)

    // db.createReadStream().on('data', console.log)
    try {
      const bobData = yield r.userData('bob')
      t.same(bobData, expectedUserData)
    } catch (err) {
      t.error(err)
    }

    try {
      const sharedData = yield r.sharedData('blah')
      t.same(sharedData, expectedSharedData.blah)
    } catch (err) {
      t.error(err)
    }

    r.stop()
    t.end()
  }))
})

function rethrow (err) {
  if (err) throw err
}
