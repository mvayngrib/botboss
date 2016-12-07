
const { readOnlyDB, extend } = require('./utils')

module.exports = Session

function Session (opts={ user, userData, sharedData, message, dbs }) {
  // `userData` and `sharedData` will be written to db after `message` is processed

  extend(this, opts)
  // will be thrown out after `message` is processed
  this.tmp = {}
  if (!this.sharedData) {
    this.sharedData = {}
  }

  // this.dbs = {
  //   // sharedData: readOnlyDB(dbs.sharedData),
  //   // userData: readOnlyDB(dbs.userData)
  // }

  this.outbound = []
}

Session.prototype.getSharedData = function (key) {
  return this.dbs.sharedData.get(key)
}

Session.prototype.getUserData = function (key) {
  return this.dbs.userData.get(key)
}

Session.prototype.send = function ({ message, to, other }) {
  this.outbound.push({
    object: message,
    to: { permalink: to },
    other
  })
}

Session.prototype.reply = function (message, other={}) {
  return this.send({
    message,
    to: this.user,
    other
  })
}

Session.prototype.end = function () {
  this.ended = true
}

Session.from = function ({ message, runner, userData, sharedData, sessionData }) {
  return new Session({
    dbs: {
      sharedData: runner && runner.sharedDataDB,
      userData: runner && runner.userDataDB
    },
    user: message.author,
    userData,
    sharedData,
    sessionData,
    message
  })
}
