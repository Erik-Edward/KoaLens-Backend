const winston = require('winston');

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  defaultMeta: { service: 'koalens-backend' },
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    }),
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' })
  ]
});

// Create special function to log AI-related events
const logAIRequest = (provider, data) => {
  logger.info(`AI Request [${provider}]`, { provider, ...data });
};

const logAIResponse = (provider, data) => {
  logger.info(`AI Response [${provider}]`, { provider, ...data });
};

module.exports = {
  logger,
  logAIRequest,
  logAIResponse
};