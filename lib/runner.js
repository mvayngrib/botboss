
// const Immutable = require('immutable')
const debug = require('debug')('tradle:botboss')
const deepExtend = require('deep-extend')
const pump = require('pump')
const through = require('through2')
const subdown = require('subleveldown')
const mutexify = require('mutexify')
const lexint = require('lexicographic-integer')
const indexer = require('feed-indexer')
const tradle = require('@tradle/engine')
const topics = tradle.topics
const { TYPE, MESSAGE_TYPE, ENTRY_PROP } = tradle.constants
const utils = tradle.utils
const Session = require('./session')
const Promise = require('./promise')
const co = Promise.coroutine
const LOCK_TIMEOUT = 10000
const TEST = process.env.NODE_ENV === 'test'

module.exports = Runner

function Runner ({ bot, log, db, node, name }) {
  const self = this

  this.name = name || node.name || node.permalink.slice(0, 6)
  this.bot = bot
  this.sessionData = promisesub(db, 'p', db.options)
  this.userData = promisesub(db, 'u', db.options)
  this.sharedData = promisesub(db, 's', db.options)
  this.db = promisifyDB(db)
  this.node = TEST ? node : utils.promisifyNode(node)
  this._locks = {}

  const customTopics = {
    bothandled: 'bothandled'
  }

  const indexed = indexer({
    feed: log,
    db: this.userData,
    primaryKey: 'link',
    reduce: function (state, change, cb) {
      let value = change.value
      const topic = value.topic
      if (value.type !== MESSAGE_TYPE || value.author === node.permalink) {
        return cb()
      }

      if (topic === customTopics.bothandled) {
        const newState = deepExtend(state)
        newState.bothandled = '1'
        return cb(null, newState)
      }

      value = deepExtend({
        bothandled: '0'
      }, value)

      delete value.topic
      cb(null, value)
    }
  })

  const sep = indexed.separator
  const bothandled = indexed.by('bothandled', function (state, change) {
    if (typeof state.bothandled !== 'undefined') {
      return state.bothandled + sep +
        // state.recipient + sep +
        // retain log order
        getEntryLink(state) + sep +
        state.link
    }
  })

  pump(
    bothandled.createReadStream('0'),
    through.obj(function (data, enc, cb) {
      self.run(data)
        .then(result => cb(null, result))
        .catch(err => {
          self._debug('processing failed for data', data, err)
          cb()
        })
    }),
    through.obj(function (data, enc, cb) {
      log.append({
        topic: customTopics.bothandled,
        link: data.link
      }, cb)
    })
  )
}

Runner.prototype._debug = function () {
  const args = Array.prototype.slice.call(arguments)
  args.unshift(this.name)
  return debug.apply(null, args)
}

Runner.prototype.prereceive = function () {
  // receive SelfIntroduction / IdentityPublishRequest
}

Runner.prototype.run = co(function* (message) {
  const userId = message.author
  // one message at a time per user
  const unlock = yield this.lock(userId)
  let session
  try {
    [session] = Promise.race([
      this._run(message),
      promiseTimeout(LOCK_TIMEOUT)
    ])
  } catch (err) {
    this._debug('failed to process', message)
    return
  } finally {
    unlock()
  }

  const { userData, sharedData } = session
  validateSerializable(userData, 'userData is not serializable')
  validateSerializable(sharedData, 'sharedData is not serializable')

  const batch = [
    {
      type: 'put',
      key: this.userData.prefix + userId,
      value: userData
    }
  ].concat(
    objToBatch(sharedData, this.sharedData.prefix)
  )

  yield this.db.batch(batch)
})

Runner.prototype._run = co(function* (message) {
  const results = yield allSettled([
    this.sessionData.get(message.author),
    this.userData.get(message.author),
    this.node.objects.get(message.link)
  ])

  const [sessionData={}, userData={}, object] = inspectionValues(results)
  if (!object) {
    throw new Error(`object not found: ${message.link}`)
  }

  message.object = object
  const sharedData = {}
  const session = new Session({
    node: this.node,
    userData,
    sharedData,
    message
  })

  yield this._runSession(session)
  return session
})

Runner.prototype.lock = function (id) {
  const self = this
  if (!this._locks[id]) {
    this._locks[id] = mutexify()
  }

  const lock = this._locks[id]
  return new Promise(function (resolve, reject) {
    lock(function (unlock) {
      resolve(unlock)
    })
  })
}

Runner.prototype._runSession = co(function* (session) {
  return this.bot.run(session)
})

function objToBatch (obj, prefix) {
  prefix = prefix || ''
  return Object.keys(obj).map(k => {
    return { type: 'put', key: prefix + k, value: obj[k] }
  })
}

function promiseTimeout (millis) {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      reject(new Error('timed out'))
    }, millis)
  })
}

function validateSerializable (obj, errMsg) {
  try {
    JSON.stringify(obj)
  } catch (e) {
    if (errMsg) throw new Error(errMsg)

    throw e
  }
}

function allSettled (promises) {
  return Promise.all(promises.map(promise => promise.reflect()))
}

function inspectionValues (results) {
  return results.map(r => r.isFulfilled() ? r.value() : null)
}

function getEntryLink (state) {
  return lexint.pack(state[ENTRY_PROP], 'hex')
}

function promisesub () {
  const db = subdown.apply(null, arguments)
  return promisifyDB(db)
}

function promisifyDB (db) {
  ;['get', 'put', 'del', 'batch'].forEach(method => {
    const orig = db[method]
    if (typeof orig !== 'function') return

    db[method] = function () {
      const cb = arguments[arguments.length - 1]
      if (typeof cb === 'function') {
        return orig.apply(this, arguments)
      }

      return new Promise((resolve, reject) => {
        const args = Array.prototype.slice.call(arguments)
        args.push(function (err, result) {
          if (err) reject(err)
          else resolve(result)
        })

        db[method].apply(db, args)
      })
    }
  })

  return db
}
