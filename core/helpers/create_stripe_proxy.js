module.exports = function createStripeProxy (id, object, attempts = 5, initialWait = 10, debug = false) {

  const createProxyable = (id, object, identifiers) => {
    let fn = async function () {
      let parent = object;
      let obj = parent;
      let list = identifiers.slice();
      let i = 0;
      let prop;
      while (list.length) {
        i++;
        prop = list.shift();
        parent = obj;
        obj = obj[prop];
        if (!obj) {
          throw new Error(`Could not find: "${prop}" in identifiers "${id}.${identifiers.slice(0, i).join('.')}"`);
        }
      }
      if (typeof obj !== 'function') {
        throw new Error(`Not a function: "${prop}" in identifiers "${id}.${identifiers.slice(0, i).join('.')}"`);
      }
      let result;
      let success = false;
      let n = 0;
      let wait = initialWait;
      while (!success && n <= attempts) {
        n++;
        debug && console.log(`Calling: ${id}.${identifiers.join('.')} attempt ${n}`);
        try {
          result = await obj.call(parent, ...arguments);
          success = true;
        } catch (e) {
          if (e.statusCode === 429) {
            await new Promise(res => setTimeout(() => res(), wait));
            wait = Math.ceil(wait * (1.5 + (0.5 * Math.random())));
          } else {
            throw e;
          }
        }
        // Sometimes Stripe craps the bed
        if (result === void 0) {
          success = false;
        }
      }
      if (result === void 0) {
        throw new Error(`${id}.${identifiers.join('.')} invalid data after ${n} attempts`);
      }
      return result;
    };
    fn.id = id;
    fn.object = object;
    fn.identifiers = identifiers;
    return fn;
  }

  const handler = {
    get (target, prop, receiver) {
      let name = target.id || '(unknown)';
      let object = target.object || target;
      let identifiers = target.identifiers || [];
      let fn = createProxyable(name, object, identifiers.concat(prop));
      return new Proxy(fn, handler);
    }
  };

  return new Proxy({id: id, object: object}, handler);

};
