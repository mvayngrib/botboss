
const { readOnlyDB } = require('./utils')

module.exports = Session

function Session ({ node, userData, sharedData, message, dbs }) {
  this.message = message

  // will be written to db after `message` is processed
  this.userData = userData
  this.sharedData = sharedData

  // will be thrown out after `message` is processed
  this.tmp = {}
  this.dbs = {
    sharedData: readOnlyDB(dbs.sharedData),
    userData: readOnlyDB(dbs.userData)
  }

  this.outbound = []
}

Session.prototype.getSharedData = function (key) {
  return this.dbs.sharedData.get(key)
}

Session.prototype.getUserData = function (key) {
  return this.dbs.userData.get(key)
}

Session.prototype.send = function ({ message, to }) {
  this.outbound.push({ message, to })
}
