
const subdown = require('subleveldown')
const Promise = require('bluebird')

exports.Promise = Promise

exports.co = Promise.coroutine

exports.conoop = exports.co(function* () {})

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
  return Promise.all(promises.map(promise => promise.reflect()))
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
