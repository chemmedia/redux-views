const ofIdentity = [x => x]

const getNewIdSelector = fns => {
  const res = (...args) =>
    fns.map(fn => encodeURIComponent(fn(...args))).join('/')
  res.fns = fns
  res.idSelector = res
  return res
}

const combinedIdSelectors = {}
const getCombinedIdSelector = idSelectors => {
  const len = idSelectors.length
  if (!combinedIdSelectors[len]) combinedIdSelectors[len] = []

  const entry = combinedIdSelectors[len].find(([candidates]) =>
    candidates.every((fn, idx) => idSelectors[idx] === fn)
  )

  if (entry) return entry[1]

  const fn = getNewIdSelector(idSelectors)
  combinedIdSelectors[len].push([idSelectors, fn])
  return fn
}

const getIdSelector = dependencies => {
  const sortedIdSelectors = dependencies
    .map(d => d.idSelector)
    .filter(Boolean)
    .sort()

  const uniqIdSelectors = []
  let prevIdSelector
  sortedIdSelectors.forEach(idSelector => {
    if (idSelector !== prevIdSelector) uniqIdSelectors.push(idSelector)
    prevIdSelector = idSelector
  })

  if (uniqIdSelectors.length === 0) return null
  return uniqIdSelectors.length === 1
    ? uniqIdSelectors[0]
    : getCombinedIdSelector(uniqIdSelectors)
}

const depCache = new Map();

const getDependencies = (dependencies) => {
  if (!dependencies) {
    return [];
  }

  return dependencies
    .map(dependency => {
      const cachedDependency = depCache.get(dependency);
      if (cachedDependency) {
        return cachedDependency;
      }

      const resultDependencies = dependency.dependencies ? getDependencies(dependency.dependencies) : [dependency];
      depCache.set(dependency, resultDependencies);
      return resultDependencies;
    })
    .reduce((total, current) => {
      total.push(...current.filter(c => !c.idSelector && !total.includes(c)));
      return total;
    }, []);
};

const getComputeFn = (
  dependencies_,
  computeFn,
  equalityFn,
  getCache,
  isCompilationSelector,
) => {
  const dependencies = dependencies_.length > 0 ? dependencies_ : ofIdentity
  let nComputations = 0

  const resFn = (...args) => {
    const cache = getCache(...args)
    const [prevArgs, prevRes] = cache
    const computedArgs = dependencies.map(fn => fn(...args))
    if (prevArgs && computedArgs.every((val, idx) => val === prevArgs[idx])) {
      return prevRes
    }
    nComputations++

    const res = isCompilationSelector ? computeFn(args[0], ...computedArgs) : computeFn(...computedArgs)
    cache[0] = computedArgs
    return (cache[1] = equalityFn && equalityFn(res, prevRes) ? prevRes : res)
  }

  resFn.recomputations = () => nComputations
  resFn.resetRecomputations = () => (nComputations = 0)
  resFn.dependencies = dependencies
  resFn.resultFunc = computeFn
  return resFn
}

const getInstanceSelector = (
  dependencies,
  computeFn,
  equalityFn,
  idSelector,
  isCompilationSelector
) => {
  let cache = {}
  let usages = {}

  const result = getComputeFn(
    dependencies,
    computeFn,
    equalityFn,
    (...args) => {
      const id = idSelector(...args)
      return cache[id] || (cache[id] = new Array(2))
    },
    isCompilationSelector
  )

  result.idSelector = idSelector

  const inc = id => (usages[id] = (usages[id] || 0) + 1)
  const dec = id => {
    if (usages[id] > 1) {
      usages[id]--
    } else {
      delete cache[id]
      delete usages[id]
    }
  }

  const usableDependencies = dependencies.filter(d => d.use)
  result.use = id => {
    inc(id)

    let dependantUsages
    if (idSelector.fns) {
      const ids = id.split('/').map(decodeURIComponent)
      dependantUsages = usableDependencies.map(x =>
        x.use(ids[idSelector.fns.indexOf(x.idSelector)])
      )
    } else {
      dependantUsages = usableDependencies.map(x => x.use(id))
    }

    return () => {
      dec(id)
      dependantUsages.forEach(stop => stop())
    }
  }

  result.clearCache = (recursive = true) => {
    cache = {}
    usages = {}
    if (recursive) usableDependencies.forEach(x => x.clearCache())
  }

  return result
}

export const createSelector = (dependencies, computeFn, equalityFn) => {
  if (
    process.env.NODE_ENV !== 'production' &&
    !dependencies.concat(computeFn).every(dep => typeof dep === 'function')
  ) {
    const dependencyTypes = dependencies.map(dep => typeof dep).join(', ')
    const computeFnType = typeof computeFn
    throw new Error(
      'Selector creators expect all input-selectors to be functions, ' +
        `instead received the following types:\n - dependencies: [${dependencyTypes}]\n computeFn: ${computeFnType}`
    )
  }
  const idSelector = getIdSelector(dependencies)
  if (idSelector) {
    return getInstanceSelector(
      dependencies,
      computeFn,
      equalityFn,
      idSelector,
    )
  }
  const cache = new Array(2)
  return getComputeFn(
    dependencies,
    computeFn,
    equalityFn,
    () => cache,
  )
}

export const createCompilationSelector = (_dependencies, compilationDependencies, computeFn, equalityFn) => {
  if (
    process.env.NODE_ENV !== 'production' &&
    !_dependencies.concat(computeFn, ...compilationDependencies).every(dep => typeof dep === 'function')
  ) {
    const dependencyTypes = _dependencies.map(dep => typeof dep).join(', ')
    const compilationDependencyTypes = compilationDependencies.map(dep => typeof dep).join(', ')
    const computeFnType = typeof computeFn
    throw new Error(
      'Selector creators expect all input-selectors to be functions, ' +
      `instead received the following types:\n - dependencies: [${dependencyTypes}]\n - compilation depedencies: [${compilationDependencyTypes}]\n computeFn: ${computeFnType}`
    )
  }


  const dependencies = [..._dependencies, ...getDependencies(compilationDependencies)];

  const idSelector = getIdSelector(dependencies)
  if (idSelector) {
    return getInstanceSelector(
      dependencies,
      computeFn,
      equalityFn,
      idSelector,
      !!compilationDependencies
    )
  }
  const cache = new Array(2)
  return getComputeFn(
    dependencies,
    computeFn,
    equalityFn,
    () => cache,
    !!compilationDependencies
  )
}
