
const { constants } = require('@tradle/engine')
const { TYPE } = constants
const builders = {}

module.exports = function (model) {
  if (!builders[model.id]) {
    builders[model.id] = makeBuilder(model)
  }

  return builders[model.id]()
}

function makeBuilder (model) {
  if (model.properties.toJSON) {
    throw new Error('model cannot have property toJSON')
  }

  return function () {
    const obj = {
      [TYPE]: model.id
    }

    const builder = {
      toJSON: () => obj
    }

    Object.keys(model.properties).forEach(p => {
      builder[p] = val => {
        // TODO: validate per range, validate required, etc.
        obj[p] = val
        return builder
      }
    })

    return builder
  }
}
