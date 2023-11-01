module.exports = {
  message: 'Must be non-empty string',
  validate: v => v && typeof v === 'string'
};
