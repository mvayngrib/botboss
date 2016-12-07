const crypto = require('crypto')
const { constants } = require('@tradle/engine')
const models = require('@tradle/models')
const { TYPE, SIG } = constants

exports.fake = fake
exports.fakeSigned = fakeSigned

function fakeSigned (model) {
  const val = fake(model)
  val[SIG] = crypto.randomBytes(32).toString('hex')
  return val
}

function fake (model) {
  model = typeof model === 'string'
    ? MODELS_BY_ID[model]
    : model

  if (!model) throw new Error('model not found')

  const type = model.id
  const data = {
    [TYPE]: type
  }

  const props = model.required || Object.keys(model.properties)
  props.forEach(name => {
    if (name.charAt(0) === '_' || name === 'from' || name === 'to') return

    data[name] = fakeValue(model, name)
  })

  return data
}

function fakeValue (model, propName) {
  const prop = model.properties[propName]
  const type = prop.type
  switch (type) {
    case 'string':
      return crypto.randomBytes(32).toString('hex')
    case 'number':
      return Math.random() * 100 | 0
    case 'date':
      return Date.now()
    case 'object':
      if (prop.ref === 'tradle.Money') {
        return {
          "value": "6000",
          "currency": "€"
        }
      } else {
        return 'blah'
      }
    case 'boolean':
      return Math.random() < 0.5
    case 'array':
      return [fake(prop.items.ref || prop.items)]
    default:
      throw new Error(`unknown property type: ${type} for property ${propName}`)
  }
}
