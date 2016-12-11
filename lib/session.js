
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

Session.prototype.send = function ({ message, to, other }) {
  return this.node.send({
    object: message,
    to: { permalink: to },
    other
  })
}

Session.prototype.reply = co(function* (message, other={}) {
  const result = yield this.send({
    message,
    to: this.user,
    other
  })

  result.message.objectinfo = omit(result.object, 'object')
  return normalizeMessage({
    message: result.message,
    payload: result.object.object
  })
})

Session.prototype.end = function () {
  this.ended = true
}

Session.prototype.seal = function (link) {
  return this.node.seal(link)
}

Session.prototype.lookup = function (link) {
  return this.node.objects.get(link)
}

Session.from = function ({ node, message, runner, userData, sharedData, sessionData }) {
  return new Session({
    node: node || runner.node,
    dbs: runner && runner.dbs,
    user: message.author,
    userData,
    sharedData,
    sessionData,
    message
  })
}
