const express = require('express');
const morgan = require('morgan');
const helmet = require('helmet');
const authMiddleware = require('./middleware/auth');
const errorHandler = require('./middleware/errorHandler');
const objectsRouter = require('./routes/objects');
const tagsRouter = require('./routes/tags');
const healthRouter = require('./routes/health');
const docsRouter = require('./routes/docs');

const app = express();

app.use(helmet());
app.use(morgan('combined'));
app.use(authMiddleware);

app.use('/v1/objects', objectsRouter);
app.use('/v1/tags', tagsRouter);
app.use('/v1/health', healthRouter);
app.use('/v1/docs', docsRouter);

app.use((req, res) => {
  res.status(404).json({ error: 'not_found', details: 'Route not found' });
});

app.use(errorHandler);

module.exports = app;
