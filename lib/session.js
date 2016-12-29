
const { constants } = require('@tradle/engine')
const { SIG } = constants
const {
  readOnlyDB,
  extend,
  normalizeMessage,
  deepExtend,
  co,
  omit
} = require('./utils')

module.exports = Session

function Session (opts={ node, user, userData, sharedData, message, dbs }) {
  // `userData` and `sharedData` will be written to db after `message` is processed

  extend(this, opts)
  // will be thrown out after `message` is processed
  this.tmp = {}
  if (!this.sharedData) {
    this.sharedData = {}
  }

  Object.defineProperty(this, 'info', {
    get: function () {
      return {
        identity: deepExtend(this.node.identityInfo)
      }
    }
  })

  // this.dbs = {
  //   // sharedData: readOnlyDB(dbs.sharedData),
  //   // userData: readOnlyDB(dbs.userData)
  // }
}

Session.prototype.getSharedData = function (key) {
  return this.dbs.sharedData.get(key)
}

Session.prototype.getUserData = function (key) {
  return this.dbs.userData.get(key)
}

Session.prototype.send = co(function* ({ message, to, other }) {
  const method = message[SIG] ? 'send' : 'signAndSend'
  const opts = {
    to: { permalink: to }
  }

  if (typeof message === 'string') {
    opts.link = message
  } else {
    opts.object = message
  }

  if (other) opts.other = other
  const result = yield this.node[method](opts)

  return normalizeMessage(result)
})

Session.prototype.seal = function (link) {
  return this.node.seal(link)
}

Session.prototype.addContact = function (identity) {
  return this.node.addContactIdentity(identity)
}

Session.prototype.lookup = function (link) {
  return this.node.objects.get(link)
}

Session.prototype.reply = co(function* (message, other={}) {
  return this.send({
    to: this.user,
    message,
    other
  })
})

Session.prototype.commit = function () {
  throw new Error('override me')
}

Session.prototype.end = function () {
  this.ended = true
}

Session.blank = function ({ runner, node, user, userData, sharedData, sessionData }) {
  const session = new Session({
    node: node || runner.node,
    dbs: runner && runner.dbs,
    user,
    userData,
    sharedData,
    sessionData
  })

  session.commit = function () {
    return runner.commitSession(this)
  }

  return session
}

Session.from = function ({ runner, node, message, userData, sharedData, sessionData }) {
  const session = new Session({
    node: node || runner.node,
    dbs: runner && runner.dbs,
    user: message && (message.author || message.user),
    userData,
    sharedData,
    sessionData,
    message
  })

  session.commit = function () {
    return runner.commitSession(this)
  }

  return session
}
