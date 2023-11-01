const fs = require('fs');
const os = require('os');

const CustomerManager = require('./helpers/customer_manager.js');

const CustomersObject = require('./objects/customers.js');
const InvoicesObject = require('./objects/invoices.js');
const PaymentMethodsObject = require('./objects/payment_methods.js');
const PlansObject = require('./objects/plans.js');
const UsageRecordsObject = require('./objects/usage_records.js');

class InstantPayments {

  constructor (secretKey, publishableKey, plansJSON) {

    if (typeof plansJSON === 'string') {
      plansJSON = plansJSON.replaceAll('~', os.homedir());
      if (!fs.existsSync(plansJSON)) {
        throw new Error(`Could not find .json file for plans in "${plansJSON}": does not exist`);
      } else if (fs.statSync(plansJSON).isDirectory()) {
        throw new Error(`Could not find .json file for plans in "${plansJSON}": is a directory`);
      } else {
        try {
          plansJSON = JSON.parse(fs.readFileSync(plansJSON).toString());
        } catch (e) {
          throw new Error(`Invalid JSON in "${plansJSON}": ${e.message}`);
        }
      }
    } else if (typeof plansJSON !== 'object' || !plansJSON) {
      throw new Error(`Must provide valid JSON for plans or a valid JSON file path`);
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
    this.customerManager = new CustomerManager(secretKey, publishableKey, plansJSON);

    // Load object endpoints
    this.customers = new CustomersObject(this.customerManager);
    this.invoices = new InvoicesObject(this.customerManager);
    this.paymentMethods = new PaymentMethodsObject(this.customerManager);
    this.plans = new PlansObject(this.customerManager);
    this.usageRecords = new UsageRecordsObject(this.customerManager);

  }

};

module.exports = InstantPayments;