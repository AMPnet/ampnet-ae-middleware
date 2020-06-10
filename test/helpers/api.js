const { createAxiosInstance } = require('axios-api-doc-generator');

const API = (() => {
  return createAxiosInstance({
    baseURL: `http://0.0.0.0:8124`
  })
})();
 
module.exports = API;