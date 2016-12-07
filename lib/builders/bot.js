
const { TYPE } = require('@tradle/engine').constants
const { co, conoop, Promise, isPromise } = require('../utils')

module.exports = Bot

function Bot () {
  if (!(this instanceof Bot)) return new Bot()

  // this._flows = {}
  // this._defaultFlow = null
  this._handlers = []
}

// Bot.prototype.flow = function (name, handler) {
//   if (typeof name === 'function') {
//     this._defaultFlow = name
//     return this
//   }

//   if (name in this._flows) {
//     throw new Error('this flow is already registered')
//   }

//   this._flows[name] = handler
//   return this
// }

Bot.prototype.use = function (handler) {
  this._handlers.push(handler)
}

Bot.prototype.type = function (type, handler) {
  this._handlers.push(createTypeHandler(type, handler))
}

Bot.prototype.run = co(function* (session) {
  const handlers = this._handlers.slice()
  for (var i = 0; i < handlers.length; i++) {
    const maybePromise = this._handlers[i](session)
    if (isPromise(maybePromise)) yield maybePromise
  }
})

/**
 * Override this
 */
Bot.prototype.stop = conoop

function createTypeHandler (type, handler) {
  return function (session) {
    if (session.message.payload[TYPE] === type) {
      return handler(session)
    }
  }
}
