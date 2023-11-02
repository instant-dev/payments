const fs = require('fs');
const os = require('os');
const path = require('path');

const Bootstrapper = require('./bootstrapper/index.js');

const CustomerManager = require('./helpers/customer_manager.js');

const CustomersObject = require('./objects/customers.js');
const InvoicesObject = require('./objects/invoices.js');
const PaymentMethodsObject = require('./objects/payment_methods.js');
const PlansObject = require('./objects/plans.js');
const UsageRecordsObject = require('./objects/usage_records.js');

class InstantPayments {

  /**
   * Bootstraps Stripe with `metadata: instpay` products and prices corresponding to your line items
   * @param {string} secretKey         Your Stripe secret key
   * @param {string} plansPathname     Path to your plans.json object
   * @param {string} lineItemsPathname Path to your line_items.json object
   * @returns {object} bootstrapResult           The result of bootstrapping
   * @returns {object} bootstrapResult.cache     Your cached Stripe plans object
   * @returns {array}  bootstrapResult.Plans     Templates for your Plans from plans.json
   * @returns {array}  bootstrapResult.LineItems Templates for your Line Items from line_items.json
   */
  static async bootstrap (secretKey, plansPathname, lineItemsPathname) {
    let files = [
      {pathname: plansPathname, identifier: 'plansPathname', output: 'Plans'},
      {pathname: lineItemsPathname, identifier: 'lineItemsPathname', output: 'LineItems'}
    ];
    let output = {};
    for (const file of files) {
      if (typeof file.pathname !== 'string') {
        throw new Error(`${file.identifier} must be a string`);
      }
      file.pathname = file.pathname.replaceAll('~', os.homedir());
      if (!file.pathname.startsWith('/')) {
        file.pathname = path.join(process.cwd(), file.pathname);
      }
      if (!fs.existsSync(file.pathname)) {
        throw new Error(`${file.identifier} "${file.pathname}" does not exist`);
      } else if (fs.statSync(file.pathname).isDirectory()) {
        throw new Error(`${file.identifier} "${file.pathname}" must be a file`);
      }
      let buffer = fs.readFileSync(file.pathname);
      try {
        let json = JSON.parse(buffer.toString());
        output[file.output] = json;
      } catch (e) {
        throw new Error(`${file.identifier} "${file.pathname}" has invalid JSON: ${e.message}`);
      }
    }
    const {Plans, LineItems} = output;
    const cache = await Bootstrapper.bootstrap(secretKey, Plans, LineItems);
    return {cache, Plans, LineItems};
  }

  /**
   * Writes a file to cache your bootstrapped plans and associated them with an environment
   * @param {string} cachePathname Desired pathname for your cached plans
   * @param {string} env           Desired environment (e.g. development, test, production)
   * @param {object} cache         JSON for your cached plans
   * @returns {boolean} success
   */
  static async writeCache (cachePathname, env, cache) {
    if (typeof cachePathname !== 'string') {
      throw new Error(`cachePathname must be a valid string`);
    }
    if (typeof env !== 'string') {
      throw new Error(`env must be a valid string representing the environment`);
    }
    if (!cache || typeof cache !== 'object') {
      throw new Error(`cache must be a JSON object`);
    }
    cachePathname = cachePathname.replaceAll('~', os.homedir());
    if (!cachePathname.startsWith('/')) {
      cachePathname = path.join(process.cwd(), cachePathname);
    }
    let paths = cachePathname.split('/');
    for (let i = 1; i < paths.length - 1; i++) {
      let pathname = paths.slice(0, i + 1).join('/');
      if (!fs.existsSync(pathname)) {
        fs.mkdirSync(pathname);
      } else if (!fs.statSync(pathname).isDirectory()) {
        throw new Error(`Can not write to "${cachePathname}", "${pathname}" is not a valid directory`);
      }
    }
    let json = {};
    if (fs.existsSync(cachePathname)) {
      try {
        json = JSON.parse(fs.readFileSync(cachePathname).toString());
      } catch (e) {
        throw new Error(`Can not write to "${cachePathname}", contains invalid JSON: ${e.message}`);
      }
    }
    json[env] = cache;
    fs.writeFileSync(cachePathname, JSON.stringify(json, null, 2));
    return true;
  }

  /**
   * Creates a new InstantPayments instance by loading from a cache
   * Will load based on `process.env.NODE_ENV`
   * @param {string} secretKey      Your Stripe secret key
   * @param {string} publishableKey Your Stripe publishable key
   * @param {string} cachePathname  The pathname for your cached plan details
   */
  constructor (secretKey, publishableKey, cachePathname) {

    let cachedPlans;
    if (cachePathname && typeof cachePathname === 'object') {
      cachedPlans = cachePathname;
    } else if (typeof cachePathname !== 'string') {
      throw new Error(`cachePathname must be a string`);
    } else {
      cachePathname = cachePathname.replaceAll('~', os.homedir());
      if (!cachePathname.startsWith('/')) {
        cachePathname = path.join(process.cwd(), cachePathname);
      }
      let cachedObject;
      if (!fs.existsSync(cachePathname)) {
        throw new Error(`Could not find JSON file for plans in "${cachePathname}": does not exist`);
      } else if (fs.statSync(cachePathname).isDirectory()) {
        throw new Error(`Could not find JSON file for plans in "${cachePathname}": is a directory`);
      } else {
        try {
          cachedObject = JSON.parse(fs.readFileSync(cachePathname).toString());
        } catch (e) {
          throw new Error(`Invalid JSON in "${cachePathname}": ${e.message}`);
        }
        let env = process.env.VERCEL_ENV || process.env.NODE_ENV || 'development';
        if (!cachedObject[env]) {
          throw new Error(`No cached plans for environment "${env}" found in "${cachePathname}"`);
        }
        cachedPlans = cachedObject[env];
      }
    }

    if (!secretKey || typeof secretKey !== 'string') {
      throw new Error(`secretKey must be a valid Stripe Secret Key`);
    }

    if (!publishableKey || typeof publishableKey !== 'string') {
      throw new Error(`publishableKey must be a valid Stripe Publishable Key`);
    }

    /**
     * @private
     */
    this.customerManager = new CustomerManager(secretKey, publishableKey, cachedPlans);

    // Load object endpoints
    this.customers = new CustomersObject(this.customerManager);
    this.invoices = new InvoicesObject(this.customerManager);
    this.paymentMethods = new PaymentMethodsObject(this.customerManager);
    this.plans = new PlansObject(this.customerManager);
    this.usageRecords = new UsageRecordsObject(this.customerManager);

  }

};

module.exports = InstantPayments;