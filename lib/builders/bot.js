
const typeforce = require('typeforce')
const { TYPE } = require('@tradle/engine').constants
const { co, conoop, Promise, isPromise, extend } = require('../utils')

module.exports = Bot

function Bot (opts) {
  if (!(this instanceof Bot)) return new Bot()

  // typeforce({
  //   node: typeforce.Object
  // }, opts)

  // extend(this, opts)

  // this._flows = {}
  // this._defaultFlow = null
  this._prehandlers = []
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

Bot.prototype.pre = function (handler) {
  this._prehandlers.push(handler)
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

Bot.prototype.runpre = co(function* (opts) {
  const handlers = this._prehandlers.slice()
  for (var i = 0; i < handlers.length; i++) {
    let ret = handlers[i](opts)
    if (isPromise(ret)) ret = yield ret
    if (ret === false) break
  }
})

Bot.prototype.run = co(function* (session) {
  const handlers = this._handlers.slice()
  for (var i = 0; i < handlers.length; i++) {
    let ret = handlers[i](session)
    if (isPromise(ret)) ret = yield ret
    if (ret === false) break
    if (session && session.ended) break
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
