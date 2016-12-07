'use strict'

process.env.NODE_ENV = process.env.NODE_ENV || 'test'

const memdown = require('memdown')
const test = require('tape-co').default
const changesFeed = require('changes-feed')
const tradle = require('@tradle/engine')
const { TYPE, MESSAGE_TYPE } = tradle.constants
const Runner = require('../')
const builder = require('../lib/builders')
global.Promise = require('../lib/promise')

let dbCounter = 0
const createDB = function () {
  return tradle.utils.levelup('' + (dbCounter++), { db: memdown })
}

const createLog = function () {
  return changesFeed(createDB())
}

test('blah', function* () {
  const objects = {
    a: {
      [TYPE]: MESSAGE_TYPE,
      message: 'ho'
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

  const log = createLog()
  log.append({
    topic: 'newobj',
    author: 'bob',
    link: 'a',
    type: objects.a[TYPE]
  }, rethrow)

  const db = createDB()
  const b = new builder.Bot()
  b.run = function (session) {
    console.log('HA!', session)
  }

  const r = new Runner({
    node,
    db: db,
    log: log,
    bot: b
  })
})

function rethrow (err) {
  if (err) throw err
}
