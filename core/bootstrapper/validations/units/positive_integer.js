module.exports = {
  message: 'Must be a positive integer',
  validate: v => {
    return typeof v === 'number' // is number
      && !isNaN(v) // is not NaN
      && parseInt(v) === parseFloat(v) // is integer
      && parseInt(v) >= 0 // is positive or 0
  }
};
