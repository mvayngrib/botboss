
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

Bot.prototype.push =
Bot.prototype.use = function (handler) {
  this._handlers.push(handler)
  return this
}

Bot.prototype.unshift = function (handler) {
  this._handlers.unshift(handler)
  return this
}

Bot.prototype.type = function (type, handler) {
  this._handlers.push(createTypeHandler(type, handler))
  return this
}

Bot.prototype.types = function (/*...types, handler*/) {
  const args = Array.prototype.slice.call(arguments)
  const handler = args.pop()
  args.forEach(type => this.type(type, handler))
  return this
}

/**
 * will get called when a new user introduces themselves
 */
// Bot.prototype.newUser = co(function* (session) {
// })

Bot.prototype.run = co(function* (session) {
  const handlers = this._handlers.slice()
  for (var i = 0; i < handlers.length; i++) {
    const maybePromise = this._handlers[i](session)
    if (isPromise(maybePromise)) yield maybePromise
    if (session.ended) break
  }
})

/**
 * Override this
 */
Bot.prototype.stop = conoop

// if (process.env.NODE_ENV === 'test') {
//   Bot.prototype._exec = function (session) {
//     this.run(session)
//   }
// }

function createTypeHandler (type, handler) {
  return function (session) {
    if (session.message.type === type) {
      return handler(session)
    }
  }
}
