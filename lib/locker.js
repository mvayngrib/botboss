
const mutexify = require('mutexify')

module.exports = function ({ timeout }) {
  const locks = {}
  return function lock (id) {
    if (!locks[id]) {
      locks[id] = mutexify()
    }

    const lock = locks[id]
    return new Promise(function (resolve, reject) {
      lock(function (unlock) {
        let timeoutID
        resolve(doUnlock)

        if (!timeout) return

        timeoutID = setTimeout(() => {
          reject(new Error('timed out'))
          doUnlock()
        }, timeout)

        if (timeoutID.unref) timeoutID.unref()

        function doUnlock () {
          clearTimeout(timeoutID)
          unlock()
        }
      })
    })
  }
}
