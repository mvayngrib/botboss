
module.exports = Session

function Session ({ node, userData, sharedData, message }) {
  this.userData = userData
  this.sharedData = sharedData
  this.message = message
}
