
const deepExtend = require('deep-extend')
const extend = require('xtend/mutable')
const Runner = require('../')
const { builder } = Runner
const { utils, constants } = require('@tradle/engine')
const { TYPE } = constants
const PRODUCT_APPLICATION = 'tradle.ProductApplication'
const SELF_INTRODUCTION = 'tradle.SelfIntroduction'
const IDENTITY_PUBLISH_REQUEST = 'tradle.IdentityPublishRequest'
const REMEDIATION = 'tradle.Remediation'
const EMPLOYEE_ONBOARDING = 'tradle.EmployeeOnboarding'

module.exports = function createBasebot (opts) {
  const { models, products } = opts
  const baseProductList = newProductList(opts)
  const bot = new builder.Bot()

  bot.types(IDENTITY_PUBLISH_REQUEST, SELF_INTRODUCTION, function (session) {
    // update userData defaults in case newCustomerState changed
    deepExtend(session.userData, newCustomerState(session), session.userData)

    if (session.message.type === IDENTITY_PUBLISH_REQUEST) {
      session.reply(IDENTITY_PUBLISHED)
    }

    const productList = personalizeProductList(baseProductList, session)
    session.reply(productList)
  })

  bot.type(PRODUCT_APPLICATION, function (session) {
    const { userData, sharedData, message } = session
    const { applications, products } = userData
    const { envelope, payload } = message
    let context = envelope.context
    let application = context && getApplication(userData.applications, context)
    if (application) {
      return requestNextForm(session, existing)
    }

    const product = payload.product
    application = newApplication(message)
    applications.push(application)
    return requestNextForm(session, application)
  })

  bot.use(function (session) {
    const { userData, sharedData, message, type } = session
    const model = models[message.type]
    if (model.subClassOf !== 'tradle.Form') return

    const { applications, products } = userData
    const { envelope, payload } = message
    const context = envelope.context
    if (!context) {
      throw new Error('form missing context')
    }

    const application = getApplication(applications, context)
    if (!application) {
      throw new Error('application not found')
    }

    // update existing form if it exists

    const links = utils.getLinks(payload)
    application.forms.push(extend({
      type,
      body: payload,
      verifications: []
    }, links))

    requestNextForm(session, application)
  })

  function getApplication (applications, context) {
    return applications.find(application => {
      return application.permalink === context
    })
  }

  function requestNextForm (session, application) {
    const product = models[application.type]
    const nextForm = product.forms.find(type => {
      return !application.forms.find(form => {
        return form.type === type
      })
    })

    const formReq = new builder.Model(models['tradle.FormRequest'])
      .form(nextForm)
      .message('Yo! Fill out this form')
      .welcome(true)
      .toJSON()

    session.reply(formReq, { context: application.permalink })
    session.end()
  }

  function newApplication (message) {
    const { envelope, payload } = message
    const product = payload.product
    return {
      type: product,
      permalink: utils.hexLink(payload),
      skip: [],
      forms: []
    }
  }

  return bot
}

function getOrDefine (obj, prop, defaultVal) {
  if (!obj[prop]) obj[prop] = defaultVal

  return obj[prop]
}

function newCustomerState (session) {
  return {
    user: session.user,
    applications: [],
    products: {},
    prefilled: {},
    // bankVersion: BANK_VERSION,
    contexts: {},
    profile: session.message.payload.profile
  }
}

function newProductList ({ models, products }) {
  const formModels = {}
  const list = products
    .filter(productModelId => productModelId !== REMEDIATION && productModelId !== EMPLOYEE_ONBOARDING)
    .map(productModelId => {
      const model = models[productModelId]
      const forms = model.forms
      forms.forEach(formModelId => {
        if (models[formModelId]) {
          // avoid duplicates by using object
          formModels[formModelId] = models[formModelId]
        }
      })

      return model
    })

  for (var p in formModels) {
    list.push(formModels[p])
  }

  return {
    [TYPE]: 'tradle.ProductList',
    list: list
  }
}

function personalizeProductList (productList, session) {
  const profile = session.userData.profile
  const name = profile && profile.firstName
  const greeting = name
    ? `Hello ${name}!`
    : 'Hello!'

  return extend({
    welcome: true,
    message: `[${greeting}](Click for a list of products)`,
  }, productList)
}
