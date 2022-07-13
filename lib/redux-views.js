'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

var ofIdentity = [function (x) {
  return x;
}];

var getNewIdSelector = function getNewIdSelector(fns) {
  var res = function res() {
    for (var _len = arguments.length, args = new Array(_len), _key = 0; _key < _len; _key++) {
      args[_key] = arguments[_key];
    }

    return fns.map(function (fn) {
      return encodeURIComponent(fn.apply(void 0, args));
    }).join('/');
  };

  res.fns = fns;
  res.idSelector = res;
  return res;
};

var combinedIdSelectors = {};

var getCombinedIdSelector = function getCombinedIdSelector(idSelectors) {
  var len = idSelectors.length;
  if (!combinedIdSelectors[len]) combinedIdSelectors[len] = [];
  var entry = combinedIdSelectors[len].find(function (_ref) {
    var candidates = _ref[0];
    return candidates.every(function (fn, idx) {
      return idSelectors[idx] === fn;
    });
  });
  if (entry) return entry[1];
  var fn = getNewIdSelector(idSelectors);
  combinedIdSelectors[len].push([idSelectors, fn]);
  return fn;
};

var getIdSelector = function getIdSelector(dependencies) {
  var sortedIdSelectors = dependencies.map(function (d) {
    return d.idSelector;
  }).filter(Boolean).sort();
  var uniqIdSelectors = [];
  var prevIdSelector;
  sortedIdSelectors.forEach(function (idSelector) {
    if (idSelector !== prevIdSelector) uniqIdSelectors.push(idSelector);
    prevIdSelector = idSelector;
  });
  if (uniqIdSelectors.length === 0) return null;
  return uniqIdSelectors.length === 1 ? uniqIdSelectors[0] : getCombinedIdSelector(uniqIdSelectors);
};

var depCache = new Map();

var getDependencies = function getDependencies(dependencies) {
  if (!dependencies) {
    return [];
  }

  return dependencies.map(function (dependency) {
    var cachedDependency = depCache.get(dependency);

    if (cachedDependency) {
      return cachedDependency;
    }

    var resultDependencies = dependency.dependencies ? getDependencies(dependency.dependencies) : [dependency];
    depCache.set(dependency, resultDependencies);
    return resultDependencies;
  }).reduce(function (total, current) {
    total.push.apply(total, current.filter(function (c) {
      return !c.idSelector && !total.includes(c);
    }));
    return total;
  }, []);
};

var getComputeFn = function getComputeFn(dependencies_, computeFn, equalityFn, getCache, isCompilationSelector) {
  var dependencies = dependencies_.length > 0 ? dependencies_ : ofIdentity;
  var nComputations = 0;

  var resFn = function resFn() {
    for (var _len2 = arguments.length, args = new Array(_len2), _key2 = 0; _key2 < _len2; _key2++) {
      args[_key2] = arguments[_key2];
    }

    var cache = getCache.apply(void 0, args);
    var prevArgs = cache[0],
        prevRes = cache[1];
    var computedArgs = dependencies.map(function (fn) {
      return fn.apply(void 0, args);
    });

    if (prevArgs && computedArgs.every(function (val, idx) {
      return val === prevArgs[idx];
    })) {
      return prevRes;
    }

    nComputations++;
    var res = isCompilationSelector ? computeFn.apply(void 0, [args[0]].concat(computedArgs)) : computeFn.apply(void 0, computedArgs);
    cache[0] = computedArgs;
    return cache[1] = equalityFn && equalityFn(res, prevRes) ? prevRes : res;
  };

  resFn.recomputations = function () {
    return nComputations;
  };

  resFn.resetRecomputations = function () {
    return nComputations = 0;
  };

  resFn.dependencies = dependencies;
  resFn.resultFunc = computeFn;
  return resFn;
};

var getInstanceSelector = function getInstanceSelector(dependencies, computeFn, equalityFn, idSelector, isCompilationSelector) {
  var cache = {};
  var usages = {};
  var result = getComputeFn(dependencies, computeFn, equalityFn, function () {
    var id = idSelector.apply(void 0, arguments);
    return cache[id] || (cache[id] = new Array(2));
  }, isCompilationSelector);
  result.idSelector = idSelector;

  var inc = function inc(id) {
    return usages[id] = (usages[id] || 0) + 1;
  };

  var dec = function dec(id) {
    if (usages[id] > 1) {
      usages[id]--;
    } else {
      delete cache[id];
      delete usages[id];
    }
  };

  var usableDependencies = dependencies.filter(function (d) {
    return d.use;
  });

  result.use = function (id) {
    inc(id);
    var dependantUsages;

    if (idSelector.fns) {
      var ids = id.split('/').map(decodeURIComponent);
      dependantUsages = usableDependencies.map(function (x) {
        return x.use(ids[idSelector.fns.indexOf(x.idSelector)]);
      });
    } else {
      dependantUsages = usableDependencies.map(function (x) {
        return x.use(id);
      });
    }

    return function () {
      dec(id);
      dependantUsages.forEach(function (stop) {
        return stop();
      });
    };
  };

  result.clearCache = function (recursive) {
    if (recursive === void 0) {
      recursive = true;
    }

    cache = {};
    usages = {};
    if (recursive) usableDependencies.forEach(function (x) {
      return x.clearCache();
    });
  };

  return result;
};

var createSelector = function createSelector(dependencies, computeFn, equalityFn) {
  if (process.env.NODE_ENV !== 'production' && !dependencies.concat(computeFn).every(function (dep) {
    return typeof dep === 'function';
  })) {
    var dependencyTypes = dependencies.map(function (dep) {
      return typeof dep;
    }).join(', ');
    var computeFnType = typeof computeFn;
    throw new Error('Selector creators expect all input-selectors to be functions, ' + ("instead received the following types:\n - dependencies: [" + dependencyTypes + "]\n computeFn: " + computeFnType));
  }

  var idSelector = getIdSelector(dependencies);

  if (idSelector) {
    return getInstanceSelector(dependencies, computeFn, equalityFn, idSelector);
  }

  var cache = new Array(2);
  return getComputeFn(dependencies, computeFn, equalityFn, function () {
    return cache;
  });
};
var createCompilationSelector = function createCompilationSelector(_dependencies, compilationDependencies, computeFn, equalityFn) {
  if (process.env.NODE_ENV !== 'production' && !_dependencies.concat.apply(_dependencies, [computeFn].concat(compilationDependencies)).every(function (dep) {
    return typeof dep === 'function';
  })) {
    var dependencyTypes = _dependencies.map(function (dep) {
      return typeof dep;
    }).join(', ');

    var compilationDependencyTypes = compilationDependencies.map(function (dep) {
      return typeof dep;
    }).join(', ');
    var computeFnType = typeof computeFn;
    throw new Error('Selector creators expect all input-selectors to be functions, ' + ("instead received the following types:\n - dependencies: [" + dependencyTypes + "]\n - compilation depedencies: [" + compilationDependencyTypes + "]\n computeFn: " + computeFnType));
  }

  var dependencies = [].concat(_dependencies, getDependencies(compilationDependencies));
  var idSelector = getIdSelector(dependencies);

  if (idSelector) {
    return getInstanceSelector(dependencies, computeFn, equalityFn, idSelector, !!compilationDependencies);
  }

  var cache = new Array(2);
  return getComputeFn(dependencies, computeFn, equalityFn, function () {
    return cache;
  }, !!compilationDependencies);
};

var createStructuredSelector = (function (selectors) {
  if (process.env.NODE_ENV !== 'production' && typeof selectors !== 'object') {
    throw new Error('createStructuredSelector expects first argument to be an object ' + ("where each property is a selector, instead received a " + typeof selectors));
  }

  var ids = Object.keys(selectors);

  var compute = function compute() {
    var res = {};

    for (var _len = arguments.length, vals = new Array(_len), _key = 0; _key < _len; _key++) {
      vals[_key] = arguments[_key];
    }

    vals.forEach(function (val, idx) {
      return res[ids[idx]] = val;
    });
    return res;
  };

  return createSelector(Object.values(selectors), compute);
});

var createIdSelector = (function (fn) {
  var res = function res(s) {
    for (var _len = arguments.length, args = new Array(_len > 1 ? _len - 1 : 0), _key = 1; _key < _len; _key++) {
      args[_key - 1] = arguments[_key];
    }

    return fn.apply(void 0, args);
  };

  res.idSelector = res;
  return res;
});

exports.createCompilationSelector = createCompilationSelector;
exports.createIdSelector = createIdSelector;
exports.createSelector = createSelector;
exports.createStructuredSelector = createStructuredSelector;
