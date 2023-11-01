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

  static async writeCache (cachePathname, env, cache) {
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
  }

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