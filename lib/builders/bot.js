
module.exports = Bot

function Bot () {
  this._flows = {}
  this._defaultFlow = null
}

Bot.prototype.flow = function (name, handler) {
  if (typeof name === 'function') {
    this._defaultFlow = name
    return this
  }

  if (name in this._flows) {
    throw new Error('this flow is already registered')
  }

  this._flows[name] = handler
  return this
}
