const axiosApiDocGenerator = require('axios-api-doc-generator');
module.exports = (globalConfig) => axiosApiDocGenerator.jestGlobalTearDown(globalConfig);