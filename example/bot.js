
const deepExtend = require('deep-extend')
const extend = require('xtend/mutable')
const { utils, constants } = require('@tradle/engine')
const { TYPE } = constants
const Runner = require('../')
const { builder } = Runner
const { co, pick, omit } = require('../lib/utils')
const PRODUCT_APPLICATION = 'tradle.ProductApplication'
const SELF_INTRODUCTION = 'tradle.SelfIntroduction'
const IDENTITY_PUBLISH_REQUEST = 'tradle.IdentityPublishRequest'
const IDENTITY_PUBLISHED = 'tradle.IdentityPublished'
const IDENTITY = 'tradle.Identity'
const VERIFICATION = 'tradle.Verification'
const REMEDIATION = 'tradle.Remediation'
const EMPLOYEE_ONBOARDING = 'tradle.EmployeeOnboarding'
const NEXT_FORM_REQUEST = 'tradle.NextFormRequest'
const DEFAULT_PROMPTS = {
  formRequest: 'Yo! Fill out this form'
}

const getObjectID = utils.hexLink

module.exports = function createBot (opts) {
  const {
    models,
    products,
    autoprompt=true,
    autoverify=true,
    prompts=DEFAULT_PROMPTS
  } = opts

  const baseProductList = newProductList(opts)
  const bot = new builder.Bot()

  bot.types(IDENTITY_PUBLISH_REQUEST, SELF_INTRODUCTION, co(function* (session) {
    // update userData defaults in case newCustomerState changed
    deepExtend(session.userData, newCustomerState(session), session.userData)

    if (session.message.type === IDENTITY_PUBLISH_REQUEST) {
      if (session.published) {
        session.reply(utils.simpleMsg('already published', IDENTITY))
      } else {
        session.userData.published = true
        const link = getObjectID(session.message.metadata.payload)
        const result = yield session.seal(link)
        session.reply({
          [TYPE]: IDENTITY_PUBLISHED,
          identity: link
        })
      }
    }

    const productList = personalizeProductList(baseProductList, session)
    session.reply(productList)
  }))

  bot.use(function selfOrient (session) {
    try {
      session.tmp.context = session.message.envelope.context
      session.tmp.application = deduceApplication(session)
    } catch (err) {}
  })

  bot.type(PRODUCT_APPLICATION, function (session) {
    const { userData, sharedData, message, tmp } = session
    const { applications, products } = userData
    const { envelope, payload } = message
    if (tmp.application) {
      return requestNextForm(session, tmp.application)
    }

    const probable = userData.applications.find(app => {
      return app.type === payload.product
    })

    if (probable) {
      tmp.application = probable
      return requestNextForm(session, probable)
    }

    const product = payload.product
    tmp.application = application = newApplication(message)
    applications.push(application)
    return requestNextForm(session, application)
  })

  bot.type(NEXT_FORM_REQUEST, requestNextFormOrApprove)

  bot.use(co(function* handleForm (session) {
    const { userData, sharedData, message } = session
    const { envelope, payload, type } = message
    const model = models[type]
    if (model.subClassOf !== 'tradle.Form') return

    const { applications, products } = userData
    const application = session.tmp.application
    if (!application) {
      throw new Error('application not found')
    }

    // TODO: update existing form if it exists

    const links = utils.getLinks(payload)
    const formInfo = extend({
      type,
      body: payload,
      verifications: []
    }, links)

    application.forms.push(formInfo)
    if (autoverify) {
      yield verify(session, formInfo)
    }

    requestNextFormOrApprove(session, application)
  }))

  bot.autoverify = (val=true) => autoverify = val
  bot.autoprompt = (val=true) => autoprompt = val

  const verify = co(function* verify (session, form) {
    const v = newVerificationFor(session.userData, form)
    const result = yield session.reply(v, { context: session.tmp.context })
    const link = result.metadata.payload.link
    form.verifications.push({
      link,
      permalink: link,
      body: v,
      author: pick(session.info, ['link', 'permalink'])
    })
  })

  function getPrompt (name) {
    return prompts[name] || DEFAULT_PROMPTS[name]
  }

  function getApplication (applications, context) {
    return applications.find(application => {
      return application.permalink === context
    })
  }

  function deduceApplication (session) {
    const applications = session.userData.applications
    const context = session.message.envelope.context
    let application
    if (context) {
      application = getApplication(applications, context)
      if (!application) {
        throw new Error('could not deduce application')
      }
    } else {
      throw new Error('message missing context')
    }

    return application
  }

  function requestNextForm (session, application) {
    if (!autoprompt) return

    if (!application) {
      throw new Error('application not found')
    }

    const product = models[application.type]
    const nextForm = product.forms.find(type => {
      return !application.forms.find(form => {
        return form.type === type
      })
    })

    if (!nextForm) return

    const formReq = new builder.Model(models['tradle.FormRequest'])
      .form(nextForm)
      .message(getPrompt('formRequest'))
      .welcome(true)
      .toJSON()

    session.reply(formReq, { context: application.permalink })
    session.end()
    return true
  }

  function requestNextFormOrApprove (session, application) {
    if (!requestNextForm(session, application)) {
      approveProduct(session, application)
    }
  }

  function approveProduct (session, application) {
    const type = application.type
    const productModel = models[type]
    const myProductModel = models[type.replace('tradle.', 'tradle.My')]
    if (!myProductModel) {
      const congrats = {
        [TYPE]: type + 'Confirmation',
        message: `Congratulations! You were approved for: ${productModel.title}`,
        forms: getFormIds(application.forms),
        application: application.permalink
      }

      session.reply(congrats)
      session.end()
      return
    }
  }

  function getFormIds (forms) {
    return forms.map(f => {
      `${f.type}_${f.permalink}_${f.link}`
    })
  }

  function newApplication (message) {
    const { envelope, payload } = message
    const product = payload.product
    return {
      type: product,
      permalink: getObjectID(payload),
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

function getImportedVerification (userData, form) {
  const prefilled = userData.prefilled && userData.prefilled[form.type]
  if (prefilled && prefilled.verification && utils.formsEqual(prefilled.form, form.body)) {
    return prefilled.verification
  }
}

function newVerificationFor (userData, form) {
  const verification = getImportedVerification(userData, form) || {}
  if (verification.time) {
    verification.backDated = verification.time
    delete verification.time
  }

  verification.document = {
    id: form.link,
    title: form.body.title || form.type
  }

  const author = userData.user
  verification.documentOwner = {
    id: IDENTITY + '_' + author,
    title: author
  }

  verification[TYPE] = VERIFICATION
  return verification
}
