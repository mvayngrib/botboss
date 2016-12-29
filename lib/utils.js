
const crypto = require('crypto')
const deepExtend = require('deep-extend')
const extend = require('xtend/mutable')
const cloneShallow = require('xtend')
const subdown = require('subleveldown')
const pick = require('object.pick')
const omit = require('object.omit')
const Promise = require('bluebird')
const { constants } = require('@tradle/engine')
const { TYPE } = constants

exports.clone = cloneShallow
exports.extend = extend
exports.deepExtend = deepExtend
exports.pick = pick
exports.omit = omit

exports.Promise = Promise

exports.co = Promise.coroutine

exports.conoop = exports.co(function* () {})

// exports.collect = collect

exports.isPromise = obj => obj && typeof obj.then === 'function'

exports.promiseTimeout = millis => {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('timed out'))
    }, millis)

    if (timeout.unref) timeout.unref()
  })
}

exports.validateSerializable = function validateSerializable (obj, errMsg) {
  try {
    JSON.stringify(obj)
  } catch (e) {
    if (errMsg) throw new Error(errMsg)

    throw e
  }
}

exports.allSettled = function allSettled (promises) {
  return Promise.all(promises.map(promise => {
    return promise.reflect ? promise.reflect() : Promise.resolve(promise).reflect()
  }))
}

/**
 * get values from the results of an allSettled call
 */
exports.inspectionValues = function inspectionValues (results) {
  return results.map(r => r.isFulfilled() ? r.value() : undefined)
}

exports.promisifyDB = function promisifyDB (db) {
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

exports.promisifiedSubdown = function promisifiedSubdown () {
  const db = subdown.apply(null, arguments)
  return exports.promisifyDB(db)
}

exports.readOnlyDB = function (db) {
  return {
    get: db.get.bind(db),
    createReadStream: db.createReadStream.bind(db)
  }
}

exports.normalizeMessage = function ({ message, object }) {
  const envelope = message.object
  const payload = envelope.object || object.object
  const payloadMetadata = cloneShallow(message.objectinfo || getMetadata(object))
  if (!payloadMetadata.type) payloadMetadata.type = payload[TYPE]

  return {
    envelope: message.object,
    payload: payload,
    metadata: {
      envelope: getMetadata(message),
      payload: payloadMetadata
    },
    user: message.author,
    type: payload[TYPE]
  }
}

function getMetadata (wrapper) {
  const metadata = pick(wrapper, ['link', 'permalink', 'author', 'type'])
  if (!metadata.type && wrapper.object) metadata.type = wrapper.object[TYPE]
  return metadata
}
