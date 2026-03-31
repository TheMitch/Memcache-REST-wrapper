const express = require('express');
const swaggerUi = require('swagger-ui-express');
const openApiSpec = require('../openapi/spec');

const router = express.Router();

router.get('/openapi.json', (_req, res) => {
  res.json(openApiSpec);
});

router.use('/', swaggerUi.serve);
router.get(
  '/',
  swaggerUi.setup(null, {
    explorer: true,
    swaggerOptions: {
      url: './openapi.json',
    },
  }),
);

module.exports = router;
