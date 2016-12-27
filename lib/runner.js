
// const Immutable = require('immutable')
const { inherits } = require('util')
const { EventEmitter } = require('events')
const debug = require('debug')('tradle:botboss')
const deepExtend = require('deep-extend')
const pump = require('pump')
const through = require('through2')
const mutexify = require('mutexify')
const lexint = require('lexicographic-integer')
const indexer = require('feed-indexer')
const { utils, topics, constants } = require('@tradle/engine')
const { TYPE, MESSAGE_TYPE, ENTRY_PROP } = constants
const Session = require('./session')
const { TIMEOUT } = require('./errors')
const { extend } = require('./utils')
const {
  co,
  Promise,
  promiseTimeout,
  allSettled,
  inspectionValues,
  validateSerializable,
  promisifiedSubdown,
  promisifyDB,
  normalizeMessage
} = require('./utils')

const locker = require('./locker')
const TEST = process.env.NODE_ENV === 'test'
const LOCK_TIMEOUT = TEST ? 1000 : 10000
const HANDLED_STATUS = {
  todo: '0',
  done: '1'
}

module.exports = Runner

function Runner ({ bot, log, db, node, name }) {
  const self = this

  EventEmitter.call(this)

  this.name = name || node.name || node.permalink.slice(0, 6)
  this.bot = bot

  this.dbs = {}
  // used internally
  this.dbs.sessionData = promisifiedSubdown(db, 'p', db.options)

  // storage for bot per user
  this.dbs.userData = promisifiedSubdown(db, 'u', db.options)

  // general storage for bot
  this.dbs.sharedData = promisifiedSubdown(db, 's', db.options)
  this.db = promisifyDB(db)
  this.node = TEST ? node : utils.promisifyNode(node, Promise)
  this.lock = locker({ timeout: LOCK_TIMEOUT })

  const customTopics = {
    bothandled: 'bothandled'
  }

  const indexed = indexer({
    feed: log,
    db: this.dbs.userData,
    primaryKey: 'link',
    reduce: function (state, change, cb) {
      let value = change.value
      const topic = value.topic
      if (topic !== topics.newobj && topic !== customTopics.bothandled) {
        return cb()
      }

      if (topic === customTopics.bothandled) {
        const newState = deepExtend(state)
        newState.bothandled = HANDLED_STATUS.done
        return cb(null, newState)
      }

      if (value.type !== MESSAGE_TYPE || value.author === node.permalink) {
        return cb()
      }

      value = deepExtend({
        bothandled: HANDLED_STATUS.todo
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
    bothandled.createReadStream({ eq: HANDLED_STATUS.todo, live: true, keys: false }),
    through.obj(function (message, enc, cb) {
      self.run(message)
        .then(session => {
          cb(null, { session, message })
        })
        .catch(err => {
          self._debug('processing failed for message', message, err)
          cb()
        })
    }),
    through.obj(function ({ message, session }, enc, cb) {
      log.append({
        topic: customTopics.bothandled,
        link: message.link
      }, cb)
    })
  )
}

inherits(Runner, EventEmitter)

Runner.prototype._debug = function () {
  const args = Array.prototype.slice.call(arguments)
  args.unshift(this.name)
  return debug.apply(null, args)
}

// Runner.prototype.prereceive = co(function* () {
//   // receive SelfIntroduction / IdentityPublishRequest
// })

Runner.prototype.receive = co(function* (message, sender) {
  if (Buffer.isBuffer(message)) {
    message = utils.unserializeMessage(message)
  }

  const type = message.object[TYPE]
  this._debug('preprocessing', type)
  yield this.bot.runpre({ node: this.node, message, sender })
  this._debug('preprocessed', type)
  yield this.node.receive(message, sender)
  this._debug('processed', type)
})

Runner.prototype.run = co(function* (message) {
  const userId = message.author
  // one message at a time per user
  const unlock = yield this.lock(userId)
  this.emit('handling', message)

  let session
  try {
    session = yield this._run(message)
  } catch (err) {
    if (err.message === TIMEOUT.message) {
      this.emit('timeout', message, err)
    } else {
      this.emit('error', err)
    }

    this._debug('failed to process', message, err)
    return
  } finally {
    unlock()
  }

  yield this.commitSession(session)
  this.emit('handled', session)
  return session
})

Runner.prototype.userData = function (user) {
  return getOrEmpty(this.dbs.userData, user)
}

Runner.prototype.sharedData = function (user) {
  return getOrEmpty(this.dbs.sharedData, user)
}

Runner.prototype.sessionData = function (user) {
  return getOrEmpty(this.dbs.sessionData, user)
}

Runner.prototype.commitSession = co(function* (session) {
  const { userData, sharedData, message } = session
  const { user } = message
  validateSerializable(userData, 'userData is not serializable')
  validateSerializable(sharedData, 'sharedData is not serializable')

  const batch = [
    {
      type: 'put',
      key: this.dbs.userData.db.prefix + user,
      value: userData
    }
  ].concat(
    objToBatch(sharedData, this.dbs.sharedData.db.prefix)
  )

  yield this.db.batch(batch)
})

Runner.prototype._run = co(function* (message) {
  const results = yield allSettled([
    this.sessionData(message.author),
    this.userData(message.author),
    this.node.objects.get(message.link)
  ])

  const [sessionData={}, userData={}, envelope] = inspectionValues(results)
  if (!envelope) {
    throw new Error(`object not found: ${message.link}`)
  }

  extend(message, envelope)
  const session = Session.from({
    runner: this,
    user: message.author,
    message: normalizeMessage({ message }),
    userData,
    sessionData
  })

  yield this._runSession(session)
  return session
})

Runner.prototype._runSession = co(function* (session) {
  return this.bot.run(session)
})

Runner.prototype.stop = co(function* () {
  try {
    yield this.bot.stop()
  } catch (err) {
    this._debug('bot.stop() failed', err)
  }

  yield Promise.all([
    this.db.close()
  ])

  this.emit('stop')
})

/**
 * Introduce a new user
 */
// Runner.prototype.introduce = co(function* (introduction) {
//   yield this.node.addContactIdentity(introduction.identity)
//   yield this.node.receiveMsg(introduction)
// })

function objToBatch (obj, prefix) {
  prefix = prefix || ''
  return Object.keys(obj).map(k => {
    return { type: 'put', key: prefix + k, value: obj[k] }
  })
}

function getEntryLink (state) {
  return lexint.pack(state[ENTRY_PROP], 'hex')
}

const getOrEmpty = co(function* getOrEmpty (db, key) {
  try {
    return db.get(key)
  } catch (err) {
    if (!err.notFound) throw err

    return {}
  }
})
