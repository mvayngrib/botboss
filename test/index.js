'use strict'

process.env.NODE_ENV = process.env.NODE_ENV || 'test'

const test = require('tape')
const extend = require('xtend/mutable')
const memdown = require('memdown')
const changesFeed = require('changes-feed')
const tradle = require('@tradle/engine')
const utils = tradle.utils
const { TYPE, MESSAGE_TYPE, SIG } = tradle.constants
const Runner = require('../')
const builder = require('../lib/builders')
const { Promise, co } = require('../lib/utils')
const collect = Promise.promisify(require('stream-collector'))

let dbCounter = 0
const createDB = function () {
  return utils.levelup('' + (dbCounter++), { db: memdown })
}

const createLog = function () {
  return changesFeed(createDB())
}

test('basic', function (t) {
  const payload = {
    [TYPE]: 'hey',
    [SIG]: 'asdf',
    message: 'ho'
  }

  const objects = {
    a: {
      [TYPE]: MESSAGE_TYPE,
      object: payload
    },
    [utils.hexLink(payload)]: payload
  }

  const toSend = {
    to: 'bob',
    message: {
      [TYPE]: 'blah'
    }
  }

  // TODO: take this out to test helpers
  const sent = []
  const node = {
    permalink: 'joe',
    objects: {
      get: function (link) {
        if (typeof link === 'object') {
          link = link.link
        }

        if (link in objects) {
          const object = objects[link]
          return Promise.resolve({
            type: object[TYPE],
            link: link,
            permalink: link,
            object: object
          })
        }

        const err = new Error('NotFound')
        err.notFound = true
        return Promise.reject(err)
      }
    },
    send: function (data) {
      sent.push(data)
      return Promise.resolve({
        message: { object: { object: data } },
        object: { object: data }
      })
    },
    signAndSend: function (data) {
      sent.push(data)
      return Promise.resolve({
        message: { object: { object: data } },
        object: { object: data }
      })
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
    permalink: 'a',
    type: objects.a[TYPE],
    objectinfo: {
      link: 'b',
      permalink: 'b',
      author: 'bob'
    }
  }, rethrow)

  const db = createDB()
  const b = new builder.Bot()

  // HANDLERS

  b.use(function (session) {
    for (var p in session.message) {
      t.same(session.message[p], {
        user: 'bob',
        type: objects.a.object[TYPE],
        envelope: objects.a,
        payload: objects.a.object,
        metadata: {
          payload: {
            author: 'bob',
            link: 'b',
            permalink: 'b',
            type: objects.a.object[TYPE]
          },
          envelope: {
            author: 'bob',
            link: 'a',
            permalink: 'a',
            type: MESSAGE_TYPE
          }
        }
      }[p])
    }

    t.same(session.message, {
      user: 'bob',
      type: objects.a.object[TYPE],
      envelope: objects.a,
      payload: objects.a.object,
      metadata: {
        payload: {
          author: 'bob',
          link: 'b',
          permalink: 'b',
          type: objects.a.object[TYPE]
        },
        envelope: {
          author: 'bob',
          link: 'a',
          permalink: 'a',
          type: MESSAGE_TYPE
        }
      }
    })

    return new Promise(resolve => {
      session.userData.something = {
        some: 'data'
      }

      setTimeout(resolve, 100)
    })
  })

  b.type('hey', function (session) {
    extend(session.sharedData, expectedSharedData)
    session.send(toSend)
  })

  b.type('hi', t.fail)

  const r = new Runner({
    node,
    db: db,
    log: log,
    bot: b
  })

  r.on('handled', co(function* (session) {
    t.equal(sent.length, 1)
    t.equal(sent[0].to.permalink, toSend.to)
    t.same(sent[0].object, toSend.message)

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

    try {
      const sessionData = yield collect(r.dbs.sessionData.createReadStream())
      t.equal(sessionData.length, 0)
    } catch (err) {
      t.error(err)
    }

    yield r.stop()
    t.end()
  }))
})

function rethrow (err) {
  if (err) throw err
}
